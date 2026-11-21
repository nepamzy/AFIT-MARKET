'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { paystackConfig, serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/server/modules/identity-and-access/security'
import {
  dbFailed,
  done,
  failed,
  gate,
  type ActionState,
} from '@/server/modules/shared/action-helpers'
import { applyPaymentEvent } from './apply'
import { verifyToCall } from './events'
import { initializeTransaction, verifyTransaction } from './paystack'

/** Starts a Paystack payment for an unpaid order. The amount is read from the database, not the form. */
export async function payWithPaystackAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const orderId = String(fd.get('orderId') ?? '')
  if (!z.uuid().safeParse(orderId).success) return failed('That order was not found.')
  const gated = await gate({ roles: ['customer'], aal: 'aal2' })
  if ('state' in gated) return gated.state
  if (!paystackConfig()) return failed('Online payment is not open yet.')
  if (!(await rateLimit(`payinit:${gated.who.userId}`, 600, 15)))
    return failed('Too many payment attempts. Please wait a few minutes.')

  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('payment_prepare', { p_order: orderId })
  if (error) return dbFailed(error)
  const prep = data as { reference: string; amount_kobo: number; order_number: string }
  const { data: u } = await sb.auth.getUser()
  const email = u.user?.email
  if (!email) return failed('Please sign in again.')

  let url: string
  try {
    const init = await initializeTransaction({
      email,
      amountKobo: Number(prep.amount_kobo),
      reference: prep.reference,
      callbackUrl: `${serverEnv().SITE_URL}/api/payments/return`,
      orderNumber: prep.order_number,
    })
    await createSupabaseServiceClient().rpc('payment_set_access_code', {
      p_reference: prep.reference,
      p_access_code: init.access_code,
    })
    url = init.authorization_url
  } catch (e) {
    logger.error('paystack initialize failed', { err: String(e) })
    return failed('We could not reach the payment provider. Please try again in a moment.')
  }
  redirect(url)
}

/** Starts one Paystack payment for every unpaid order of a checkout (several shops, one payment). */
export async function payCheckoutAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const checkoutId = String(fd.get('checkoutId') ?? '')
  if (!z.uuid().safeParse(checkoutId).success) return failed('That checkout was not found.')
  const gated = await gate({ roles: ['customer'], aal: 'aal2' })
  if ('state' in gated) return gated.state
  if (!paystackConfig()) return failed('Online payment is not open yet.')
  if (!(await rateLimit(`payinit:${gated.who.userId}`, 600, 15)))
    return failed('Too many payment attempts. Please wait a few minutes.')
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('payment_prepare_checkout', { p_checkout: checkoutId })
  if (error) return dbFailed(error)
  const prep = data as { reference: string; amount_kobo: number; order_number: string }
  const { data: u } = await sb.auth.getUser()
  const email = u.user?.email
  if (!email) return failed('Please sign in again.')
  let url: string
  try {
    const init = await initializeTransaction({
      email,
      amountKobo: Number(prep.amount_kobo),
      reference: prep.reference,
      callbackUrl: `${serverEnv().SITE_URL}/api/payments/return`,
      orderNumber: prep.order_number,
    })
    await createSupabaseServiceClient().rpc('payment_set_access_code', {
      p_reference: prep.reference,
      p_access_code: init.access_code,
    })
    url = init.authorization_url
  } catch (e) {
    logger.error('paystack initialize failed', { err: String(e) })
    return failed('We could not reach the payment provider. Please try again in a moment.')
  }
  redirect(url)
}

/**
 * "I have paid, confirm my payment": asks Paystack directly about the customer's payment(s) for an order (or for every order
 * of a checkout) and lets the database apply the answer. Safe to press more than once. Needs no webhook.
 */
export async function confirmPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const orderId = String(fd.get('orderId') ?? '')
  const checkoutId = String(fd.get('checkoutId') ?? '')
  if (!z.uuid().safeParse(orderId).success && !z.uuid().safeParse(checkoutId).success)
    return failed('That order was not found.')
  const gated = await gate({ roles: ['customer'], aal: 'aal2' })
  if ('state' in gated) return gated.state
  if (!paystackConfig()) return failed('Online payment is not open yet.')
  if (!(await rateLimit(`payconfirm:${gated.who.userId}`, 600, 12)))
    return failed('Too many tries. Please wait a few minutes and try again.')
  // the customer's own orders only (row security): this proves the order belongs to them
  const sb = await createSupabaseServerClient()
  const mine = z.uuid().safeParse(orderId).success
    ? await sb.from('orders').select('id').eq('id', orderId)
    : await sb.from('orders').select('id').eq('checkout_id', checkoutId)
  const ids = (mine.data ?? []).map((o) => o.id as string)
  if (ids.length === 0) return failed('That order was not found.')
  const svc = createSupabaseServiceClient()
  const [{ data: txns }, { data: groups }] = await Promise.all([
    svc
      .from('payment_transactions')
      .select('reference, status')
      .in('order_id', ids)
      .neq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(5),
    svc
      .from('payment_group_orders')
      .select('payment_groups(reference, status)')
      .in('order_id', ids)
      .limit(10),
  ])
  const refs = new Set<string>()
  for (const t of txns ?? []) refs.add(String(t.reference))
  for (const g of (groups ?? []) as unknown as {
    payment_groups: { reference: string; status: string } | null
  }[])
    if (g.payment_groups && g.payment_groups.status !== 'succeeded')
      refs.add(g.payment_groups.reference)
  if (refs.size === 0) {
    revalidatePath('/orders')
    return done('Your payment is already confirmed.')
  }
  let paid = false
  for (const reference of [...refs].slice(0, 5)) {
    try {
      const v = await verifyTransaction(reference)
      const call = verifyToCall(reference, v)
      if (call) {
        const outcome = await applyPaymentEvent(call)
        if (outcome === 'paid' || outcome === 'already_succeeded') paid = true
      }
    } catch (e) {
      logger.error('payment confirm failed', { err: String(e) })
    }
  }
  revalidatePath('/orders')
  revalidatePath(`/orders/${ids[0]}`)
  if (!paid)
    return failed(
      'We have not received this payment yet. If you have just paid, wait a minute and press the button again.',
    )
  return done('Payment confirmed. Thank you!')
}
