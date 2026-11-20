import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { checkAccess } from '@/server/modules/identity-and-access/guard'
import { rateLimit } from '@/server/modules/identity-and-access/security'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }

/**
 * One picture of an applicant's student ID card, for a platform administrator only. Access is checked here and again in the
 * database function, which also writes an audit line every time a picture is opened. Never cached.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ user: string; kind: string; side: string }> },
) {
  const { user, kind, side } = await ctx.params
  if (
    !z.uuid().safeParse(user).success ||
    !['vendor', 'rider'].includes(kind) ||
    !['front', 'back'].includes(side)
  )
    return new NextResponse(null, { status: 404, headers: noStore })
  const { who, decision } = await checkAccess({ roles: ['platform_admin'], aal: 'aal2' })
  if (!decision.allow) return new NextResponse(null, { status: 401, headers: noStore })
  if (!(await rateLimit(`idcard:${who.userId}`, 300, 60)))
    return new NextResponse(null, { status: 429, headers: noStore })
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('admin_view_id_card', {
    p_user: user,
    p_kind: kind,
    p_side: side,
  })
  if (error || typeof data !== 'string' || !data.startsWith('\\x'))
    return new NextResponse(null, { status: 404, headers: noStore })
  return new NextResponse(new Uint8Array(Buffer.from(data.slice(2), 'hex')), {
    headers: {
      ...noStore,
      'Content-Type': 'image/jpeg',
      'Content-Disposition': 'inline',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
}
