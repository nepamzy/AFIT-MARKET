import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Tiny poll used by the open app to play the notification sound: the id of the person's newest unread notification
 * (their own rows only, by row security). Returns no text, so nothing private leaves here.
 */
export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: u } = await sb.auth.getUser()
  // signed out is a normal answer (200), not an error: it keeps the browser console clean for visitors
  if (!u.user)
    return NextResponse.json({ signedIn: false }, { headers: { 'Cache-Control': 'no-store' } })
  const { data } = await sb
    .from('notifications')
    .select('id')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
  return NextResponse.json(
    {
      signedIn: true,
      id: data?.[0]?.id ?? null,
      // an opaque tag for who is signed in on this device (not the id itself): lets the device re-register for pop-ups
      viewer: createHash('sha256').update(`afit-viewer:${u.user.id}`).digest('hex').slice(0, 16),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
