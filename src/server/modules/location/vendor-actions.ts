'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { checkAccess } from '@/server/modules/identity-and-access/guard'
import { rateLimit } from '@/server/modules/identity-and-access/security'

/**
 * The shop's phone sends its position while the orders screen is open, so a rider collecting an order can see where the
 * shop is. Access is re-checked here and inside the database function.
 */
export async function postVendorLocationAction(fix: {
  lat: number
  lng: number
  accuracyM: number
}): Promise<{ accepted: boolean }> {
  const { who, decision } = await checkAccess({
    roles: ['vendor_owner', 'vendor_staff'],
    aal: 'aal2',
  })
  if (!decision.allow) return { accepted: false }
  if (![fix.lat, fix.lng, fix.accuracyM].every(Number.isFinite)) return { accepted: false }
  if (!(await rateLimit(`vendorloc:${who.userId}`, 600, 60))) return { accepted: false }
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('vendor_post_location', {
    p_lat: fix.lat,
    p_lng: fix.lng,
    p_accuracy: fix.accuracyM,
  })
  if (error) return { accepted: false }
  return { accepted: (data as { accepted?: boolean })?.accepted === true }
}
