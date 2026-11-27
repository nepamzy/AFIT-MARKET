'use server'

import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { gate } from '@/server/modules/shared/action-helpers'

export type CofounderAlert = { id: string; title: string; body: string; link: string | null }

const ABOUT_COFOUNDER = /co-?founder/i

/** The owner's unread alerts about the co-founder (approvals, notes, sign-up, due dates), for the pop-up. */
export async function listCofounderAlertsAction(): Promise<CofounderAlert[]> {
  const g = await gate({ roles: ['platform_admin'], aal: 'aal2' })
  if ('state' in g) return []
  const sb = await createSupabaseServerClient()
  const { data } = await sb.rpc('list_my_notifications', {
    p_limit: 10,
    p_offset: 0,
    p_unread_only: true,
  })
  const items = ((data as { items?: (CofounderAlert & { kind: string })[] } | null)?.items ?? [])
    .filter((n) => ABOUT_COFOUNDER.test(n.title))
    .slice(0, 3)
  return items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link }))
}

/** Dismissing the pop-up also marks that notification as read. */
export async function dismissCofounderAlertAction(id: string): Promise<void> {
  if (!z.uuid().safeParse(id).success) return
  const g = await gate({ roles: ['platform_admin'], aal: 'aal2' })
  if ('state' in g) return
  const sb = await createSupabaseServerClient()
  await sb.rpc('notification_mark_read', { p_id: id })
}
