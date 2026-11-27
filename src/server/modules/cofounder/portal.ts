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
  cofounder_note: string | null
  cofounder_note_at: string | null
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

export type PortalInvite = {
  id: string
  token: string
  label: string | null
  created_at: string
  used_at: string | null
  revoked_at: string | null
  shop_name: string | null
  shop_status: string | null
}
export type PortalCase = {
  case_no: string
  case_type: string
  status: string
  created_at: string
  description: string
}
export const portalInvites = () => rpc<PortalInvite[]>('cofounder_list_invites')
export const portalCases = () => rpc<PortalCase[]>('cofounder_list_cases')
