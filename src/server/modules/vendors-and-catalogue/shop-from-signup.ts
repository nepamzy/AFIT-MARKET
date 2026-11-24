import { logger } from '@/lib/logger'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { parseAutoReady } from '@/lib/auto-ready'
import { notifyAdmin } from '@/server/modules/engagement/admin-alerts'
import { notifyApplicationReceived } from '@/server/modules/engagement/dispatch'
import type { VendorChoices } from './vendor-choices'

/**
 * A shop owner now applies while creating the account. The shop details travel with the new account (in its sign-up
 * information) and become the shop application, together with the pending shop, the moment the e-mail is confirmed.
 */
export type ShopDraft = {
  businessName: string
  description: string
  pickup: string
  phone: string
  deliveryFeeKobo: number
  autoReady: { enabled: boolean; minutes: number | null }
  main: string
  extras: string[]
  other: string | null
  type: string
  place: string | null
}

const clean = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

/** Delivery fee typed in naira, 0 to 500, as kobo; null when missing or out of range. */
function feeKobo(raw: FormDataEntryValue | null): number | null {
  const t = String(raw ?? '').trim()
  if (!/^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(t)) return null
  const kobo = Math.round(Number(t) * 100)
  return kobo >= 0 && kobo <= 50000 ? kobo : null
}

export function parseShopDraft(
  fd: FormData,
  choices: Extract<VendorChoices, { ok: true }>,
  phone: string,
): { ok: true; draft: ShopDraft } | { ok: false; error: string } {
  const businessName = clean(fd.get('businessName'), 80)
  if (businessName.length < 2)
    return { ok: false, error: 'Enter your shop name (2 to 80 letters).' }
  const description = String(fd.get('description') ?? '')
    .trim()
    .slice(0, 500)
  if (description.length < 10)
    return { ok: false, error: 'Tell us what you sell (at least 10 characters).' }
  const pickup = clean(fd.get('pickup'), 200)
  if (pickup.length < 3)
    return { ok: false, error: 'Say where customers will collect their orders.' }
  const fee = feeKobo(fd.get('deliveryFee'))
  if (fee === null) return { ok: false, error: 'Enter your delivery fee: from 0 to 500 naira.' }
  const auto = parseAutoReady(fd)
  if (!auto.ok) return { ok: false, error: auto.error }
  if (fd.get('accept') !== 'on')
    return {
      ok: false,
      error: 'Please tick the box to agree to the vendor rules and the commission.',
    }
  return {
    ok: true,
    draft: {
      businessName,
      description,
      pickup,
      phone,
      deliveryFeeKobo: fee,
      autoReady: auto.value,
      main: choices.main,
      extras: choices.extras,
      other: choices.other ?? null,
      type: choices.type,
      place: choices.place ?? null,
    },
  }
}

type AuthUser = {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

/**
 * Turns the shop details saved at sign-up into the shop application (and, through the database, the pending shop).
 * Safe to call twice. Returns 'none' when the person did not apply while signing up.
 */
export async function startShopFromSignup(user: AuthUser): Promise<'created' | 'none' | 'failed'> {
  const shop = (user.user_metadata ?? {}).shop as ShopDraft | null | undefined
  if (!shop || typeof shop !== 'object') return 'none'
  const svc = createSupabaseServiceClient()
  const pending = await svc
    .from('vendor_applications')
    .select('id')
    .eq('applicant_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()
  if (!pending.data) {
    const ins = await svc.from('vendor_applications').insert({
      applicant_id: user.id,
      business_name: shop.businessName,
      contact_phone: shop.phone,
      category_id: shop.main,
      description: shop.description,
      pickup_location_text: shop.pickup,
      terms_accepted_at: new Date().toISOString(),
      extra_category_ids: shop.extras,
      other_category: shop.other,
      vendor_type: shop.type,
      shop_place: shop.place,
      auto_ready_enabled: shop.autoReady.enabled,
      auto_ready_minutes: shop.autoReady.enabled ? shop.autoReady.minutes : null,
      delivery_fee_kobo: shop.deliveryFeeKobo,
    })
    if (ins.error) {
      logger.warn('shop application from sign-up not saved', { code: ins.error.code })
      return 'failed'
    }
    notifyAdmin({ type: 'vendor_application', businessName: shop.businessName })
    notifyApplicationReceived(user.email, 'vendor')
  }
  await svc.auth.admin.updateUserById(user.id, { user_metadata: { shop: null } })
  return 'created'
}
