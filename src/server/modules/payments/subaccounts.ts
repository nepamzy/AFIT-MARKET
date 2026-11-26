import 'server-only'
import { logger } from '@/lib/logger'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { notifyAdmin } from '@/server/modules/engagement/admin-alerts'
import { decryptField } from '@/server/security/field-crypto'
import { PaymentsUnavailable, createSubaccount, setSubaccountPercent } from './paystack'

/** Sub-account percentages already brought up to date by this server instance (so the call is made once, not on every payment). */
const syncedPercent = new Map<string, number>()

/** Is "pay each shop through its own Paystack sub-account" switched on? (Admin settings, `payment_split_enabled`.) */
export async function splitEnabled(): Promise<boolean> {
  const { data } = await createSupabaseServiceClient()
    .from('platform_settings')
    .select('value')
    .eq('key', 'payment_split_enabled')
    .maybeSingle()
  return data?.value === true
}

/**
 * Makes sure each of these shops has a Paystack sub-account (from its verified bank account). Does nothing unless the
 * setting is on. A shop that cannot get one is simply left out of the split: its money stays in the main account and is
 * paid out by transfer, as before. Never throws.
 */
export async function ensureSubaccounts(vendorIds: string[]): Promise<void> {
  try {
    if (vendorIds.length === 0 || !(await splitEnabled())) return
    const sb = createSupabaseServiceClient()
    const [{ data: banks }, { data: rate }] = await Promise.all([
      sb
        .from('vendor_bank_accounts')
        .select('vendor_id, bank_code, account_cipher, vendors(name)')
        .in('vendor_id', vendorIds)
        .is('paystack_subaccount_code', null),
      sb.from('platform_settings').select('value').eq('key', 'vendor_commission_bps').maybeSingle(),
    ])
    const bps = Number(rate?.value)
    const percent = Number.isFinite(bps) && bps >= 0 ? bps / 100 /* default */ : 5
    // shops that already have a sub-account: bring its stored percentage up to the current commission
    const { data: existing } = await sb
      .from('vendor_bank_accounts')
      .select('paystack_subaccount_code')
      .in('vendor_id', vendorIds)
      .not('paystack_subaccount_code', 'is', null)
    for (const e of (existing ?? []) as { paystack_subaccount_code: string }[]) {
      const code = e.paystack_subaccount_code
      if (syncedPercent.get(code) === percent) continue
      try {
        await setSubaccountPercent(code, percent)
        syncedPercent.set(code, percent)
      } catch (err) {
        logger.error('sub-account percentage not updated', { err: String(err).slice(0, 160) })
      }
    }
    for (const b of (banks ?? []) as unknown as {
      vendor_id: string
      bank_code: string
      account_cipher: string
      vendors: { name: string } | null
    }[]) {
      try {
        const code = await createSubaccount({
          businessName: b.vendors?.name ?? 'AFIT Market shop',
          bankCode: b.bank_code,
          accountNumber: decryptField(b.account_cipher),
          commissionPercent: percent,
        })
        await sb.rpc('payout_set_subaccount', { p_vendor: b.vendor_id, p_code: code })
        // Paystack holds a new sub-account's first payout until the owner verifies it in the dashboard: tell the owner now
        notifyAdmin({ type: 'subaccount_created', shopName: b.vendors?.name ?? 'a shop' })
      } catch (e) {
        if (e instanceof PaymentsUnavailable) return
        logger.error('shop sub-account not created', { err: String(e).slice(0, 160) })
      }
    }
  } catch (e) {
    logger.error('ensureSubaccounts failed', { err: String(e).slice(0, 160) })
  }
}
