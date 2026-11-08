import 'server-only'
import { logger } from '@/lib/logger'
import { paystackConfig } from '@/lib/env'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import {
  RefundRejected,
  createRefund,
  fetchRefund,
  type RefundOutcome,
} from '@/server/modules/payments/paystack'

/**
 * Automatic refund for an order the shop declined. The database makes the refund record (full amount, approved by the system,
 * "processing"); this asks Paystack to return the money and writes down what happened. Safe to run again: the database
 * hands back the same refund, and a refund that already has a Paystack id is only checked, never asked for twice.
 */
export type AutoRefundResult =
  'nothing_to_refund' | 'refunded' | 'waiting_for_paystack' | 'failed' | 'unavailable'

type Started = {
  id: string
  status: string
  amount_kobo: number
  reference: string
  provider_ref: string | null
  mode: string
}

export async function startAutoRefund(orderId: string): Promise<AutoRefundResult> {
  const cfg = paystackConfig()
  if (!cfg) return 'unavailable'
  const sb = createSupabaseServiceClient()
  const { data, error } = await sb.rpc('refund_auto_start', {
    p_order: orderId,
    p_mode: cfg.mode === 'live' ? 'paystack_live' : 'paystack_test',
  })
  if (error) {
    logger.error('auto refund could not start', { code: error.code })
    return 'unavailable'
  }
  if (!data) return 'nothing_to_refund'
  return await settle(data as Started)
}

async function record(
  refundId: string,
  outcome: 'succeeded' | 'failed',
  ref: string | null,
  detail: string,
) {
  const sb = createSupabaseServiceClient()
  const { error } = await sb.rpc('refund_provider_outcome', {
    p_refund: refundId,
    p_outcome: outcome,
    p_provider_ref: ref,
    p_detail: detail,
  })
  if (error) logger.error('auto refund outcome not saved', { code: error.code })
}

async function flag(orderId: string, reason: string, detail: string) {
  const sb = createSupabaseServiceClient()
  await sb
    .from('reconciliation_flags')
    .insert({ order_id: orderId, reason, details: { note: detail.slice(0, 200) } })
}

async function settle(r: Started): Promise<AutoRefundResult> {
  const sb = createSupabaseServiceClient()
  let outcome: RefundOutcome
  try {
    if (r.provider_ref) outcome = await fetchRefund(r.provider_ref)
    else {
      outcome = await createRefund({
        reference: r.reference,
        amountKobo: r.amount_kobo,
        note: 'The shop declined your order.',
      })
      if (outcome.ref)
        await sb.rpc('refund_set_provider_ref', { p_refund: r.id, p_ref: outcome.ref })
    }
  } catch (e) {
    if (e instanceof RefundRejected && !r.provider_ref) {
      await record(r.id, 'failed', null, `paystack refused: ${e.message}`)
      const { data } = await sb.from('refunds').select('order_id').eq('id', r.id).single()
      if (data?.order_id) await flag(data.order_id, 'auto_refund_failed', e.message)
      return 'failed'
    }
    logger.warn('auto refund will be retried', { err: e instanceof Error ? e.name : 'error' })
    return 'waiting_for_paystack'
  }
  if (outcome.state === 'processed') {
    await record(
      r.id,
      'succeeded',
      outcome.ref ?? `paystack-refund-${r.id}`,
      'paystack processed the refund',
    )
    return 'refunded'
  }
  if (outcome.state === 'failed') {
    await record(r.id, 'failed', null, 'paystack could not complete the refund')
    const { data } = await sb.from('refunds').select('order_id').eq('id', r.id).single()
    if (data?.order_id) await flag(data.order_id, 'auto_refund_failed', 'paystack failed')
    return 'failed'
  }
  return 'waiting_for_paystack'
}

/** The daily safety net: start refunds that never started, and re-check ones still waiting. */
export async function settleAutoRefunds(
  limit = 20,
): Promise<{ started: number; checked: number; unavailable?: boolean }> {
  if (!paystackConfig()) return { started: 0, checked: 0, unavailable: true }
  const sb = createSupabaseServiceClient()
  let started = 0
  let checked = 0
  const missing = await sb.rpc('refund_auto_missing', { p_limit: limit })
  for (const orderId of (missing.data as string[] | null) ?? []) {
    await startAutoRefund(orderId)
    started++
  }
  const open = await sb.rpc('refund_auto_unfinished', { p_limit: limit })
  for (const r of (open.data as
    | {
        id: string
        amount_kobo: number
        reference: string
        provider_ref: string | null
        mode: string
      }[]
    | null) ?? []) {
    await settle({ ...r, status: 'processing' })
    checked++
  }
  return { started, checked }
}

/** Used by the Paystack webhook: a refund event for a payment reference. */
export async function applyRefundEvent(a: {
  reference: string
  outcome: 'succeeded' | 'failed'
  providerRef: string | null
}): Promise<'applied' | 'unknown'> {
  const sb = createSupabaseServiceClient()
  const found = await sb.rpc('refund_find_processing', { p_reference: a.reference, p_amount: null })
  if (!found.data) return 'unknown'
  await record(
    found.data as string,
    a.outcome,
    a.outcome === 'succeeded' ? (a.providerRef ?? `paystack-refund-${found.data}`) : null,
    `paystack event: ${a.outcome}`,
  )
  return 'applied'
}
