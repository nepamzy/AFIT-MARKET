import 'server-only'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

export const INVITE_TOKEN = /^[0-9a-f]{24}$/

/** Is shop sign-up by invitation only? (Admin, Settings: `vendor_invite_only`. Defaults to yes when the setting is missing.) */
export async function vendorInviteOnly(): Promise<boolean> {
  const { data } = await createSupabaseServiceClient()
    .from('platform_settings')
    .select('value')
    .eq('key', 'vendor_invite_only')
    .maybeSingle()
  return data ? data.value !== false : true
}

/** The invitation behind a link, or null when the link is wrong, already used or cancelled. */
export async function checkInvite(token: string): Promise<{ label: string | null } | null> {
  if (!INVITE_TOKEN.test(token)) return null
  const { data } = await createSupabaseServiceClient().rpc('vendor_invite_check', {
    p_token: token,
  })
  return (data as { label: string | null } | null) ?? null
}

export type InviteProgress = {
  label: string | null
  email: string
  confirmed: boolean
  applied: boolean
  has_shop: boolean
  draft_waiting: boolean
}

/** Where the person who used this link stopped (null when the link was never used, or was cancelled). */
export async function inviteProgress(token: string): Promise<InviteProgress | null> {
  if (!INVITE_TOKEN.test(token)) return null
  const { data } = await createSupabaseServiceClient().rpc('vendor_invite_progress', {
    p_token: token,
  })
  return (data as InviteProgress | null) ?? null
}

export type InviteRow = {
  id: string
  token: string
  label: string | null
  created_at: string
  used_at: string | null
  revoked_at: string | null
  used_by_name: string | null
}
