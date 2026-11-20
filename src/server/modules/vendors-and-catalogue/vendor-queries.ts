import 'server-only'
import { cache } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { MyVendor } from './types'

export const getMyVendor = cache(async (): Promise<MyVendor | null> => {
  const sb = await createSupabaseServerClient()
  const { data } = await sb.rpc('my_vendor')
  return (data as MyVendor | null) ?? null
})

export type ProductRow = {
  id: string
  name: string
  description: string | null
  section: string | null
  price_kobo: number
  is_available: boolean
  stock_quantity: number | null
  status: 'active' | 'archived'
}
export type EditableProduct = ProductRow & {
  groups: {
    id: string
    name: string
    min: number
    max: number
    options: { name: string; price: string; available: boolean }[]
  }[]
}

export async function listProducts(vendorId: string): Promise<ProductRow[]> {
  const sb = await createSupabaseServerClient()
  const { data } = await sb
    .from('products')
    .select('id, name, description, section, price_kobo, is_available, stock_quantity, status')
    .eq('vendor_id', vendorId)
    .eq('status', 'active')
    .order('section', { nullsFirst: false })
    .order('name')
  return (data as ProductRow[] | null) ?? []
}

/** One product with its option groups, shaped for the editor (prices as naira strings). */
export async function getEditableProduct(
  vendorId: string,
  id: string,
): Promise<EditableProduct | null> {
  const sb = await createSupabaseServerClient()
  const { data: p } = await sb
    .from('products')
    .select('id, name, description, section, price_kobo, is_available, stock_quantity, status')
    .eq('id', id)
    .eq('vendor_id', vendorId)
    .eq('status', 'active')
    .maybeSingle()
  if (!p) return null
  const { data: groups } = await sb
    .from('product_option_groups')
    .select('id, name, min_select, max_select, sort_order')
    .eq('product_id', id)
    .order('sort_order')
  const ids = (groups ?? []).map((g) => g.id)
  const { data: options } = ids.length
    ? await sb
        .from('product_options')
        .select('group_id, name, price_delta_kobo, is_available, sort_order')
        .in('group_id', ids)
        .order('sort_order')
    : { data: [] }
  return {
    ...(p as ProductRow),
    groups: (groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      min: g.min_select,
      max: g.max_select,
      options: (options ?? [])
        .filter((o) => o.group_id === g.id)
        .map((o) => ({
          name: o.name,
          price: String(o.price_delta_kobo / 100),
          available: o.is_available,
        })),
    })),
  }
}

export async function getShop(vendorId: string) {
  const sb = await createSupabaseServerClient()
  const [{ data: vendor }, { data: hours }, { data: staff }] = await Promise.all([
    sb
      .from('vendors')
      .select(
        'id, name, slug, description, contact_phone, pickup_location_text, prep_minutes, temporarily_closed, status',
      )
      .eq('id', vendorId)
      .maybeSingle(),
    sb
      .from('store_hours')
      .select('weekday, opens, closes')
      .eq('vendor_id', vendorId)
      .order('weekday')
      .order('opens'),
    sb
      .from('vendor_staff')
      .select('user_id, staff_role, created_at')
      .eq('vendor_id', vendorId)
      .order('created_at'),
  ])
  return {
    vendor,
    hours: (hours ?? []).map((h) => ({
      weekday: h.weekday as number,
      opens: String(h.opens),
      closes: String(h.closes),
    })),
    staff: staff ?? [],
  }
}

/** The shop's automatic-ready choice (null minutes when it is off). */
export async function getAutoReady(
  vendorId: string,
): Promise<{ enabled: boolean; minutes: number | null }> {
  const sb = await createSupabaseServerClient()
  const { data } = await sb
    .from('vendors')
    .select('auto_ready_enabled, auto_ready_minutes')
    .eq('id', vendorId)
    .maybeSingle()
  return {
    enabled: Boolean(data?.auto_ready_enabled),
    minutes: (data?.auto_ready_minutes as number | null | undefined) ?? null,
  }
}

export type VendorRiderRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  /** only while the code is unused */
  code: string | null
  linked: boolean
}
export async function listVendorRiders(vendorId: string): Promise<VendorRiderRow[]> {
  const sb = await createSupabaseServerClient()
  const { data } = await sb.rpc('vendor_rider_list', { p_vendor: vendorId })
  return (data as VendorRiderRow[] | null) ?? []
}

export type RiderTeamMember = {
  id: string
  rider_id: string
  name: string
  phone: string | null
  on_shift: boolean
  lat: number | null
  lng: number | null
  age_seconds: number | null
}
/** The shop's own riders, who is on shift, and where each last was. */
export async function listRiderTeam(vendorId: string): Promise<RiderTeamMember[]> {
  const sb = await createSupabaseServerClient()
  const { data } = await sb.rpc('vendor_rider_locations', { p_vendor: vendorId })
  return (data as RiderTeamMember[] | null) ?? []
}
export async function activeRiderCodes(
  vendorId: string,
): Promise<{ code: string; expires_at: string }[]> {
  const sb = await createSupabaseServerClient()
  const { data } = await sb.rpc('vendor_rider_codes_active', { p_vendor: vendorId })
  return (data as { code: string; expires_at: string }[] | null) ?? []
}
