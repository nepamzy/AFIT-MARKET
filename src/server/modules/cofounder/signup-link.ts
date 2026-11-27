import 'server-only'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

export const COFOUNDER_TOKEN = /^[0-9a-f]{24}$/

/** Is this co-founder sign-up link still good (not used, not cancelled)? */
export async function checkCofounderInvite(token: string): Promise<boolean> {
  if (!COFOUNDER_TOKEN.test(token)) return false
  const { data } = await createSupabaseServiceClient().rpc('cofounder_invite_check', {
    p_token: token,
  })
  return data === true
}

/** Uses the link up for the person whose account was just made. */
export async function consumeCofounderInvite(token: string, userId: string): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient().rpc('cofounder_invite_consume', {
    p_token: token,
    p_user: userId,
  })
  return !error && data === true
}
