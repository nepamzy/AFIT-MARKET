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
