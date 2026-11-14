import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { checkAccess } from '@/server/modules/identity-and-access/guard'
import { rateLimit } from '@/server/modules/identity-and-access/security'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Where the rider is, for the shop that is waiting for ONE rider to collect an order. Checked here and again in the database. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = (await ctx.params).id
  if (!z.uuid().safeParse(id).success)
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore })
  const { who, decision } = await checkAccess({
    roles: ['vendor_owner', 'vendor_staff'],
    aal: 'aal2',
  })
  if (!decision.allow)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore })
  if (!(await rateLimit(`vendorridermap:${who.userId}`, 60, 40)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: noStore })
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('vendor_rider_map', { p_order: id })
  if (error) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore })
  return NextResponse.json(data, { headers: noStore })
}
