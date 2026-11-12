import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { clientIp, rateLimit } from '@/server/modules/identity-and-access/security'

import { artKind, productArtSvg, type ArtKind } from '@/lib/art/scenes'

/**
 * Photos are kept by the browser for 10 minutes and by the hosting network for a day; an out-of-date copy is shown at once
 * while a new one is fetched behind it. So almost every photo comes straight from the network's cache, with no database
 * call. The shop's own editing screens ask with ?fresh and always get the current photo.
 */
const SHARED = 'public, max-age=600, s-maxage=86400, stale-while-revalidate=604800'
const FRESH = 'private, no-cache'

const placeholder = (kind: ArtKind = 'general', cache = SHARED) =>
  new NextResponse(productArtSvg(kind), {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
      'X-Afit-Photo': 'none',
      // this address is not covered by the site-wide policy (so it can be cached), so it carries its own
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  })

/**
 * A product's photo. Public on purpose, like the catalogue itself: only photos of ACTIVE products of APPROVED shops are
 * served, and nothing else about the product. No photo (or a hidden product) gets the placeholder tile, so a missing
 * photo is never an error on the page and nothing reveals whether a hidden product exists.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!z.uuid().safeParse(id).success) return new NextResponse(null, { status: 404 })
  const cache = req.nextUrl.searchParams.has('fresh') ? FRESH : SHARED
  const sb = createSupabaseServiceClient()
  // generous (a page of cards loads many photos), but a single address cannot hammer the database.
  // The limit and the photo are fetched together, so a photo costs one round trip, not two.
  const [allowed, { data }] = await Promise.all([
    rateLimit(`photo:ip:${await clientIp()}`, 60, 600),
    sb
      .from('product_images')
      .select('jpeg, updated_at, products!inner(status, vendors!inner(status))')
      .eq('product_id', id)
      .maybeSingle(),
  ])
  if (!allowed) return new NextResponse(null, { status: 429 })
  const p = data?.products as unknown as { status: string; vendors: { status: string } } | undefined
  if (!data || !p || p.status !== 'active' || p.vendors.status !== 'approved') {
    // no photo: draw a picture that suits the product, chosen from its name and its shop's category
    const { data: prod } = await sb
      .from('products')
      .select('name, status, vendors!inner(status, categories(slug))')
      .eq('id', id)
      .maybeSingle()
    const v = prod?.vendors as unknown as
      { status: string; categories?: { slug: string } | null } | undefined
    if (!prod || prod.status !== 'active' || v?.status !== 'approved')
      return placeholder('general', cache)
    return placeholder(artKind(prod.name, v.categories?.slug), cache)
  }
  const hex = String(data.jpeg).replace(/^\\x/, '')
  const body = Buffer.from(hex, 'hex')
  const etag = `"${new Date(data.updated_at).getTime()}"`
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
