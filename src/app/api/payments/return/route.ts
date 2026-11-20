import { NextResponse, type NextRequest } from 'next/server'
import { serverEnv } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/server/modules/identity-and-access/security'
import { applyPaymentEvent } from '@/server/modules/payments/apply'
import { verifyToCall } from '@/server/modules/payments/events'
import { verifyTransaction } from '@/server/modules/payments/paystack'

export const dynamic = 'force-dynamic'

/**
 * Where the customer lands after Paystack checkout. The redirect itself proves nothing: we ask the provider
 * directly (server-to-server) and let the database apply the answer idempotently. Needs a signed-in session
 * (each call costs a provider request).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone()
  const reference = url.searchParams.get('reference') ?? url.searchParams.get('trxref') ?? ''
  const back = (path: string) => NextResponse.redirect(new URL(path, serverEnv().SITE_URL), 303)
  if (!/^[A-Za-z0-9._=-]{8,100}$/.test(reference)) return back('/orders')
  const sb = await createSupabaseServerClient()
  const { data } = await sb.auth.getUser()
  if (!data.user) return back(`/login?next=${encodeURIComponent('/orders')}`)
  const svc = createSupabaseServiceClient()
  // A payment covers one order or several (one checkout with more than one shop): look the reference up as a payment
  // group first, then as a single legacy transaction.
  const { data: grp } = await svc
    .from('payment_groups')
    .select('id, customer_id, payment_group_orders(order_id, orders(checkout_id))')
    .eq('reference', reference)
    .maybeSingle()
  type Grp = {
    customer_id: string
    payment_group_orders: { order_id: string; orders: { checkout_id: string | null } | null }[]
  }
  const g = grp as Grp | null
  let landing = '/orders'
  if (g) {
    if (g.customer_id !== data.user.id) return back('/orders')
    const ids = g.payment_group_orders.map((x) => x.order_id)
    const checkout = g.payment_group_orders[0]?.orders?.checkout_id ?? null
    landing =
      ids.length === 1 ? `/orders/${ids[0]}` : checkout ? `/checkout/placed/${checkout}` : '/orders'
  } else {
    const { data: txn } = await svc
      .from('payment_transactions')
      .select('order_id, orders!inner(customer_id)')
      .eq('reference', reference)
      .maybeSingle()
    const owner = (txn as { orders?: { customer_id?: string } } | null)?.orders?.customer_id
    if (!txn || owner !== data.user.id) return back('/orders')
    landing = `/orders/${txn.order_id as string}`
  }
  if (await rateLimit(`payverify:${data.user.id}`, 300, 20)) {
    try {
      const v = await verifyTransaction(reference)
      const call = verifyToCall(reference, v)
      if (call) await applyPaymentEvent(call)
    } catch (e) {
      logger.error('payment verify failed', { err: String(e) })
    }
  }
  return back(landing)
}
