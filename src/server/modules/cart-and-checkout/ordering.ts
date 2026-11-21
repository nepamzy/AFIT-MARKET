import 'server-only'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

/**
 * Whether customers may place orders yet. It is switched on in Administration, Settings (`ordering_open`) once the AFIT board has
 * approved the launch. Until then people can sign up, apply to sell or deliver and fill a cart, but not check out. The database
 * enforces this too (platform administrators are exempt so the team can test).
 */
export async function orderingOpen(): Promise<boolean> {
  const { data } = await createSupabaseServiceClient()
    .from('platform_settings')
    .select('value')
    .eq('key', 'ordering_open')
    .maybeSingle()
  return data?.value === true
}

/**
 * Can THIS person place orders right now? Everyone can once ordering is open. While it is closed, administrators (testing) and
 * the accounts that existed before the beta can still order; newer accounts fill a cart and wait. The database enforces the same.
 */
export async function canOrderNow(userId: string | null, isAdmin: boolean): Promise<boolean> {
  if (await orderingOpen()) return true
  if (isAdmin) return true
  if (!userId) return false
  const { data } = await createSupabaseServiceClient()
    .from('ordering_early_access')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data)
}
