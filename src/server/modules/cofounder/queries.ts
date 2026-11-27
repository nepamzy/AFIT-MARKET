import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { CofounderMonth, CofounderSettings, Income } from '@/lib/cofounder'

export type CofounderData = {
  settings: CofounderSettings
  months: CofounderMonth[]
  income: Income[]
}

export async function cofounderData(): Promise<CofounderData | null> {
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('admin_cofounder_overview')
  return error || !data ? null : (data as CofounderData)
}

export type CofounderInviteRow = {
  id: string
  token: string
  created_at: string
  used_at: string | null
  revoked_at: string | null
  used_by: string | null
  used_by_name: string | null
}

export async function cofounderInvites(): Promise<CofounderInviteRow[]> {
  const sb = await createSupabaseServerClient()
  const { data } = await sb.rpc('admin_list_cofounder_invites')
  return (data ?? []) as CofounderInviteRow[]
}
