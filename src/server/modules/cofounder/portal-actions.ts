'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { notifyAdmin } from '@/server/modules/engagement/admin-alerts'
import { dbFailed, done, gate, type ActionState } from '@/server/modules/shared/action-helpers'

/**
 * The co-founder approves a shop that is waiting. The database records his name on the shop and tells the owner
 * in the app (and by push); the owner is also e-mailed from here.
 */
export async function approveShopAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get('applicationId') ?? '')
  if (!z.uuid().safeParse(id).success) return { error: 'That application is not valid.' }
  const g = await gate({ roles: ['cofounder'], aal: 'aal2' })
  if ('state' in g) return g.state
  const sb = await createSupabaseServerClient()
  const { data: before } = await sb.rpc('cofounder_list_applications', { p_status: 'pending' })
  const name =
    (before as { id: string; business_name: string }[] | null)?.find((a) => a.id === id)
      ?.business_name ?? 'A shop'
  const { error } = await sb.rpc('cofounder_approve_application', { p_application: id })
  if (error) return dbFailed(error, 'The shop could not be approved. Please try again.')
  notifyAdmin({
    type: 'cofounder',
    title: 'A shop was approved by your co-founder',
    text: `${name} was approved by your co-founder.`,
  })
  revalidatePath('/cofounder')
  revalidatePath('/cofounder/applications')
  return done(`${name} is approved. Your name is on it and the founder has been told.`)
}

/** "Send back to the founder": the shop keeps waiting, with the co-founder's note, and the founder is told. */
export async function sendBackAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get('applicationId') ?? '')
  const note = String(fd.get('note') ?? '')
    .trim()
    .slice(0, 300)
  if (!z.uuid().safeParse(id).success) return { error: 'That application is not valid.' }
  if (note.length < 5)
    return { error: 'Write a short note for the founder (at least 5 characters).' }
  const g = await gate({ roles: ['cofounder'], aal: 'aal2' })
  if ('state' in g) return g.state
  const sb = await createSupabaseServerClient()
  const { error } = await sb.rpc('cofounder_send_back', { p_application: id, p_note: note })
  if (error) return dbFailed(error, 'The note could not be sent. Please try again.')
  notifyAdmin({
    type: 'cofounder',
    title: 'Your co-founder needs you on a shop',
    text: `A shop was sent back to you with this note: ${note}`,
  })
  revalidatePath('/cofounder/applications')
  return done('Sent. The founder has been told and will decide.')
}

/** Makes shop invitation links (1 to 20 at a time) for him to hand out. */
export async function createInvitesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const count = Number(fd.get('count'))
  if (!Number.isInteger(count) || count < 1 || count > 20)
    return { error: 'Choose how many links to make (1 to 20).' }
  const g = await gate({ roles: ['cofounder'], aal: 'aal2' })
  if ('state' in g) return g.state
  const sb = await createSupabaseServerClient()
  const { error } = await sb.rpc('cofounder_create_invites', {
    p_count: count,
    p_label: String(fd.get('label') ?? '')
      .trim()
      .slice(0, 60),
  })
  if (error) return dbFailed(error)
  revalidatePath('/cofounder/invites')
  return done(`${count} new ${count === 1 ? 'link is' : 'links are'} ready below.`)
}
