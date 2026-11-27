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
