import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { checkAccess } from '@/server/modules/identity-and-access/guard'
import { rateLimit } from '@/server/modules/identity-and-access/security'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Where the shop is, for the customer who is coming to collect ONE pickup order. Checked here and again in the database. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = (await ctx.params).id
  if (!z.uuid().safeParse(id).success)
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore })
  const { who, decision } = await checkAccess({ roles: ['customer'], aal: 'aal2' })
  if (!decision.allow)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore })
  if (!(await rateLimit(`pickupmap:${who.userId}`, 60, 30)))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: noStore })
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('customer_pickup_map', { p_order: id })
  if (error) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore })
  return NextResponse.json(data, { headers: noStore })
}
