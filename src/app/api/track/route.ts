import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { cleanSource, deviceOf } from '@/lib/analytics'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/server/modules/identity-and-access/security'

export const dynamic = 'force-dynamic'

const body = z.object({
  kind: z.enum(['visit', 'app_installed', 'app_opened']),
  source: z.string().max(60).optional(),
})

/**
 * Counts a visit, an app install or an installed-app open. No cookies, no sign-in needed, and nothing personal is saved:
 * only the kind, a short source tag and the device type. Rate limited per address; a failure is silent for the visitor.
 */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await rateLimit(`track:${ip}`, 60, 30)))
    return NextResponse.json({ ok: false }, { status: 429 })
  const { error } = await createSupabaseServiceClient()
    .from('analytics_events')
    .insert({
      kind: parsed.data.kind,
      source: cleanSource(parsed.data.source),
      device: deviceOf(req.headers.get('user-agent') ?? ''),
    })
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 })
}
