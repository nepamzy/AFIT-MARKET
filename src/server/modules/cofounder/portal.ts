import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { CofounderMonth, CofounderSettings, Income } from '@/lib/cofounder'

export type PortalOverview = {
  applications_waiting: number
  approved_by_me: number
  shops_live: number
  invites_unused: number
  invites_used: number
  orders_7d: number
  cases_open: number
}

export type PortalApplication = {
  id: string
  business_name: string
  description: string | null
  contact_phone: string | null
  pickup_location_text: string | null
  shop_place: string | null
  vendor_type: string | null
  delivery_fee_kobo: number | null
  created_at: string
  status: string
  decided_at: string | null
  category: string | null
  applicant_name: string
  approved_by_name: string | null
  items: number
  riders: number
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T | null> {
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc(fn, args)
  return error ? null : (data as T)
}

export const portalOverview = () => rpc<PortalOverview>('cofounder_overview')
export const portalApplications = (status: 'pending' | 'approved') =>
  rpc<PortalApplication[]>('cofounder_list_applications', { p_status: status })
export const portalStatement = () =>
  rpc<{ settings: CofounderSettings; months: CofounderMonth[]; income: Income[] }>(
    'cofounder_statement_data',
  )
