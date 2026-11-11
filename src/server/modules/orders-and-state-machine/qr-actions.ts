'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { serverEnv } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { rateLimit } from '@/server/modules/identity-and-access/security'
import {
  dbFailed,
  done,
  failed,
  gate,
  text,
  type ActionState,
} from '@/server/modules/shared/action-helpers'

const uuid = z.uuid()

/** The customer scanned the rider's QR code and confirms they received the order. */
export async function confirmDeliveryByQrAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const orderId = text(fd, 'orderId', 40)
  if (!uuid.safeParse(orderId).success) return failed('That order was not found.')
  const g = await gate({ roles: ['customer'], aal: 'aal2' })
  if ('state' in g) return g.state
  if (fd.get('confirm') !== 'on')
    return failed('Please tick the box to confirm you received the order.')
  if (!(await rateLimit(`delivery-qr:${g.who.userId}`, 600, 30)))
    return failed('Too many attempts. Please wait a few minutes.')
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('customer_qr_confirm', {
    p_order: orderId,
    p_token: text(fd, 'token', 40),
  })
  if (error)
    return dbFailed(
      error,
      'This delivery cannot be confirmed right now. Ask your rider to show a new code.',
    )
  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  const r = data as { ok: boolean; reason?: string }
  if (!r.ok) {
    if (r.reason === 'already_completed')
      return done('This delivery was already confirmed. Thank you.')
    if (r.reason === 'qr_expired')
      return failed('This code has expired. Ask your rider to show a new one.')
    if (r.reason === 'qr_locked')
      return failed('Too many wrong tries. Ask your rider to show a new code.')
    return failed('This code is not valid any more. Ask your rider to show a new one.')
  }
  return done('Thank you. Your delivery is confirmed. Your receipt is ready.')
}

export type CustomerQr =
  { ok: true; token: string; expiresAt: string } | { ok: false; error: string }

/** The customer opens their own QR code for the arrived rider to scan (ten minutes, one use). */
export async function customerOpenDeliveryQrAction(orderId: string): Promise<CustomerQr> {
  if (!uuid.safeParse(orderId).success) return { ok: false, error: 'That order was not found.' }
  const g = await gate({ roles: ['customer'], aal: 'aal2' })
  if ('state' in g) return { ok: false, error: g.state.error ?? 'Please sign in again.' }
  if (!(await rateLimit(`customer-qr:${g.who.userId}`, 600, 30)))
    return { ok: false, error: 'Too many codes. Please wait a few minutes.' }
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('customer_qr_open', { p_order: orderId })
  if (error)
    return { ok: false, error: 'A code cannot be made yet. Wait until your rider has arrived.' }
  const r = data as { token: string; expires_at: string }
  return { ok: true, token: r.token, expiresAt: r.expires_at }
}

/** The shop shows a QR code and the customer scans it (signed in): the pickup is completed. */
export async function confirmPickupByQrAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const orderId = text(fd, 'orderId', 40)
  if (!uuid.safeParse(orderId).success) return failed('That order was not found.')
  const g = await gate({ roles: ['customer'], aal: 'aal2' })
  if ('state' in g) return g.state
  if (fd.get('confirm') !== 'on')
    return failed('Please tick the box to confirm you received the order.')
  if (!(await rateLimit(`pickup-qr:${g.who.userId}`, 600, 30)))
    return failed('Too many attempts. Please wait a few minutes.')
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('customer_pickup_qr_confirm', {
    p_order: orderId,
    p_token: text(fd, 'token', 40),
  })
  if (error)
    return dbFailed(
      error,
      'This pickup cannot be confirmed right now. Ask the shop to show a new code.',
    )
  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  const r = data as { ok: boolean; reason?: string }
  if (r.ok) return done('Thank you. Your pickup is confirmed. Your receipt is ready.')
  if (r.reason === 'already_completed') return done('This pickup was already confirmed. Thank you.')
  if (r.reason === 'qr_expired')
    return failed('This code has expired. Ask the shop to show a new one.')
  if (r.reason === 'qr_locked')
    return failed('Too many wrong tries. Ask the shop to show a new code.')
  return failed('This code is not valid any more. Ask the shop to show a new one.')
}

export type ShopPickupQr =
  { ok: true; qr: string; token: string; expiresAt: string } | { ok: false; error: string }

/** The shop opens a QR code for a customer collecting their own order. */
export async function vendorOpenPickupQrAction(orderId: string): Promise<ShopPickupQr> {
  if (!uuid.safeParse(orderId).success) return { ok: false, error: 'That order was not found.' }
  const g = await gate({ roles: ['vendor_owner', 'vendor_staff'], aal: 'aal2' })
  if ('state' in g) return { ok: false, error: g.state.error ?? 'Please sign in again.' }
  if (!(await rateLimit(`shop-pickup-qr:${g.who.userId}`, 600, 40)))
    return { ok: false, error: 'Too many codes. Please wait a few minutes.' }
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('vendor_pickup_qr_open', { p_order: orderId })
  if (error) return { ok: false, error: 'This order is not waiting for pickup any more.' }
  const r = data as { token: string; expires_at: string }
  const url = `${serverEnv().SITE_URL}/confirm/pickup/${orderId}.${r.token}`
  const QRCode = (await import('qrcode')).default
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
  return { ok: true, qr, token: r.token, expiresAt: r.expires_at }
}

/** The customer shows their pickup QR code (or reads out the code) and the shop scans or types it: the pickup is completed. */
export async function completePickupByCodeAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const orderId = text(fd, 'orderId', 40)
  if (!uuid.safeParse(orderId).success) return failed('That order was not found.')
  const g = await gate({ roles: ['vendor_owner', 'vendor_staff'], aal: 'aal2' })
  if ('state' in g) return g.state
  const code = text(fd, 'code', 24)
  if (!code) return failed('Scan the customer’s QR code or type their pickup code.')
  if (!(await rateLimit(`shop-pickup-code:${g.who.userId}`, 600, 40)))
    return failed('Too many attempts. Please wait a few minutes.')
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('complete_pickup_qr', { p_order: orderId, p_code: code })
  if (error)
    return dbFailed(
      error,
      'This order cannot be handed over right now. Refresh and check its status.',
    )
  revalidatePath('/vendor/handover')
  revalidatePath('/vendor/orders')
  const r = data as { ok: boolean; reason?: string; attempts_left?: number }
  if (r.ok) return done('Handover complete.')
  if (r.reason === 'wrong_code')
    return failed(`That code is not right. ${r.attempts_left ?? 0} tries left before it locks.`)
  if (r.reason === 'code_locked')
    return failed('Too many wrong codes. This pickup is locked; contact support.')
  return failed('That pickup code is no longer valid.')
}
