import 'server-only'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

/** Whether customers may pay when they receive their order, and the largest order they may do it for (in kobo). */
export async function payOnDeliveryRules(): Promise<{ enabled: boolean; maxKobo: number }> {
  const { data } = await createSupabaseServiceClient()
    .from('platform_settings')
    .select('key, value')
    .in('key', ['pay_on_delivery_enabled', 'pay_on_delivery_max_kobo'])
  const get = (k: string) => data?.find((r) => r.key === k)?.value
  const max = Number(get('pay_on_delivery_max_kobo'))
  return {
    enabled: get('pay_on_delivery_enabled') === true,
    maxKobo: Number.isFinite(max) && max > 0 ? max : 2_000_000,
  }
}

export type PaymentView = {
  pay_at_door: boolean
  paid: boolean
  amount_kobo: number
  can_pay_now: boolean
} | null
