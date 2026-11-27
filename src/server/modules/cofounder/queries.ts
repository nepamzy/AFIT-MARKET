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
