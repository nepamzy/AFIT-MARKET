import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { artKind, shopFrontSvg } from '@/lib/art/scenes'
import { clientIp, rateLimit } from '@/server/modules/identity-and-access/security'

const SHARED = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
const FRESH = 'private, no-cache'
const CSP = "default-src 'none'; style-src 'unsafe-inline'"

/** A shop's banner: its own picture, or a drawn shop front when it has none. Only approved shops are served. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return new NextResponse(null, { status: 404 })
  const cache = req.nextUrl.searchParams.has('fresh') ? FRESH : SHARED
  const sb = createSupabaseServiceClient()
  const [allowed, { data: v }] = await Promise.all([
    rateLimit(`banner:ip:${await clientIp()}`, 60, 600),
    sb
      .from('vendors')
      .select('id, name, status, categories(slug)')
      .eq('slug', slug)
      .maybeSingle(),
  ])
  if (!allowed) return new NextResponse(null, { status: 429 })
  const draw = (name: string, cat?: string | null) =>
    new NextResponse(shopFrontSvg(artKind(name, cat)), {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': cache,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': CSP,
      },
    })
  if (!v || v.status !== 'approved') return draw('', null)
  const cat = (v.categories as unknown as { slug: string } | null)?.slug
  const { data: b } = await sb
    .from('vendor_banners')
    .select('jpeg, updated_at')
    .eq('vendor_id', v.id)
    .maybeSingle()
  if (!b) return draw(v.name, cat)
  const body = Buffer.from(String(b.jpeg).replace(/^\\x/, ''), 'hex')
  const etag = `"${new Date(b.updated_at).getTime()}"`
  if (req.headers.get('if-none-match') === etag)
    return new NextResponse(null, { status: 304, headers: { 'Cache-Control': cache, ETag: etag } })
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': cache,
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
}
