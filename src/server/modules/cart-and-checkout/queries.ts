import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { CheckoutProblem } from '@/lib/db-errors'

export type QuoteLine = {
  item_id: string
  product_id: string
  name: string
  quantity: number
  base_price_kobo: number
  unit_price_kobo: number
  line_total_kobo: number
  options: { id: string; group: string; name: string; price_delta_kobo: number }[]
}
export type Quote = {
  empty: boolean
  fulfilment: 'pickup' | 'delivery'
  vendor_id?: string
  vendor_name?: string
  delivery_point_label?: string | null
  lines: QuoteLine[]
  problems: CheckoutProblem[]
  items_total_kobo: number
  delivery_fee_kobo: number
  platform_fee_kobo: number
  discount_kobo: number
  total_kobo: number
  delivery_fee_collection?: 'paystack' | 'direct_to_rider'
  delivery_fee_to_rider_kobo?: number
}
/** One shop's part of a checkout: its own lines, its own pickup or delivery choice, and whether it is paid now or at the door. */
export type VendorGroup = Quote & {
  vendor_id: string
  vendor_name: string
  is_food: boolean
  /** the shop has at least one rider of its own, so delivery can be chosen */
  rider_available?: boolean
  pay_timing: 'now' | 'door'
  /** Paystack's charge on this group's total, when it is paid at the door. */
  door_charge_kobo: number
}
export type MultiQuote = {
  empty: boolean
  groups: VendorGroup[]
  problems: (CheckoutProblem & { vendor_id?: string })[]
  /** What is paid online before the order goes ahead: items, Paystack's charge, and the total that Paystack will ask for. */
  pay_now_items_kobo: number
  pay_now_charge_kobo: number
  pay_now_total_kobo: number
  door_items_kobo: number
  door_enabled: boolean
  door_max_kobo: number
}
export type DeliveryPoint = { id: string; label: string; instructions: string | null }

export async function getQuote(
  fulfilment: 'pickup' | 'delivery',
  point: string | null,
): Promise<Quote | null> {
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('cart_quote', {
    p_fulfilment: fulfilment,
    p_delivery_point: point,
  })
  return error ? null : (data as Quote)
}
export async function getMultiQuote(
  choices: Record<string, 'pickup' | 'delivery'>,
  point: string | null,
  payAtDoor: boolean,
): Promise<MultiQuote | null> {
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('cart_quote_multi', {
    p_choices: choices,
    p_point: point,
    p_pod: payAtDoor,
  })
  return error ? null : (data as MultiQuote)
}
export async function listDeliveryPoints(): Promise<DeliveryPoint[]> {
  const sb = await createSupabaseServerClient()
  const { data } = await sb.rpc('list_delivery_points')
  return (data as DeliveryPoint[] | null) ?? []
}

/** Number of items in the signed-in customer's cart, for the header badge. 0 when empty, signed out or not allowed. */
export async function cartItemCount(): Promise<number> {
  const q = await getMultiQuote({}, null, false)
  return q && !q.empty
    ? q.groups.reduce((n, g) => n + g.lines.reduce((m, l) => m + l.quantity, 0), 0)
    : 0
}
