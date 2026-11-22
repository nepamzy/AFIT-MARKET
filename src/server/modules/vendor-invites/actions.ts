'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/server/modules/identity-and-access/security'
import {
  dbFailed,
  done,
  failed,
  gate,
  text,
  type ActionState,
} from '@/server/modules/shared/action-helpers'
import { INVITE_TOKEN } from './invites'

/** The owner makes a batch of personal invitation links (each one works once). */
export async function createVendorInvitesAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const g = await gate({ roles: ['platform_admin'], aal: 'aal2' })
  if ('state' in g) return g.state
  const count = Number(fd.get('count'))
  if (!Number.isInteger(count) || count < 1 || count > 200)
    return failed('Choose how many links to make (1 to 200).')
  const sb = await createSupabaseServerClient()
  const { error } = await sb.rpc('admin_create_vendor_invites', {
    p_count: count,
    p_label: text(fd, 'label', 60),
  })
  if (error) return dbFailed(error)
  revalidatePath('/admin/invites')
  return done(`${count} new ${count === 1 ? 'link is' : 'links are'} ready below.`)
}

export async function revokeVendorInviteAction(fd: FormData): Promise<void> {
  const id = String(fd.get('inviteId') ?? '')
  if (!z.uuid().safeParse(id).success) return
  const g = await gate({ roles: ['platform_admin'], aal: 'aal2' })
  if ('state' in g) return
  await (await createSupabaseServerClient()).rpc('admin_revoke_vendor_invite', { p_id: id })
  revalidatePath('/admin/invites')
}

/** A person who already has an account uses an invitation link on it, then goes to the shop application. */
export async function claimInviteAction(fd: FormData): Promise<void> {
  const token = String(fd.get('token') ?? '')
  if (!INVITE_TOKEN.test(token)) redirect('/apply')
  const g = await gate({ roles: ['customer'], aal: 'aal2' })
  if ('state' in g) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`)
  if (!(await rateLimit(`invite:${g.who.userId}`, 3600, 10))) redirect(`/join/${token}`)
  const { data } = await createSupabaseServiceClient().rpc('vendor_invite_consume', {
    p_token: token,
    p_user: g.who.userId,
  })
  redirect(data === true ? '/apply' : `/join/${token}`)
}
