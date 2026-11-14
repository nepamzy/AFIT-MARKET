import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AddToCartForm } from '@/components/domain/add-to-cart-form'
import { Badge } from '@/components/ui/badge'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { Icon } from '@/components/ui/icons'
import { Money } from '@/components/ui/money'
import { ProductCard } from '@/components/ui/product-card'
import { ProductPhoto } from '@/components/ui/product-photo'
import { Section } from '@/components/ui/section'
import { ShareButtons } from '@/components/domain/share-buttons'
import { getMenu, getProduct, productHasPhoto } from '@/server/modules/vendors-and-catalogue/public'
import { WishlistButton } from '@/components/domain/customer-forms'
import { isWishlisted } from '@/server/modules/customer/queries'
import { loadPrincipal } from '@/server/modules/identity-and-access/guard'

const SITE = process.env.SITE_URL ?? 'https://afit-market.vercel.app'
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const id = (await params).id
  const found = await getProduct(id)
  if (!found) return { title: 'Item' }
  const { vendor, product } = found
  const description = `${product.name} from ${vendor.name} for ${naira(product.price_kobo)}. Order it on AFIT Market.`
  // a shared link shows the item's own photo when it has one, otherwise the AFIT Market picture
  const image = (await productHasPhoto(product.id))
    ? { url: `/api/products/${product.id}/image`, width: 800, height: 600, alt: product.name }
    : { url: '/brand/share.jpg', width: 1200, height: 630, alt: 'AFIT Market' }
  return {
    title: product.name,
    description,
    openGraph: {
      type: 'website',
      siteName: 'AFIT Market',
      title: product.name,
      description,
      images: [image],
    },
    twitter: { card: 'summary_large_image', title: product.name, description, images: [image.url] },
  }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const found = await getProduct((await params).id)
  if (!found) notFound()
  const { vendor, product } = found
  const menu = await getMenu(vendor.slug)
  const who = await loadPrincipal()
  const canWish = who.authenticated && who.roles.includes('customer')
  const saved = canWish ? await isWishlisted(product.id) : false
  const more = (menu?.products ?? []).filter((p) => p.id !== product.id).slice(0, 4)
  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Items', href: '/products' },
          { label: vendor.name, href: `/vendors/${vendor.slug}` },
          { label: product.name },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <ProductPhoto
            productId={product.id}
            icon="bag"
            label={product.name}
            eager
            className="aspect-[4/3] rounded-[var(--radius-card)]"
          />
        </div>
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-navy-900">{product.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
              Sold by{' '}
              <Link
                href={`/vendors/${vendor.slug}`}
                className="font-bold text-brand-700 hover:underline"
              >
                {vendor.name}
              </Link>
              <Badge tone={vendor.open_now ? 'success' : 'neutral'}>
                {vendor.open_now ? 'Open now' : 'Closed now'}
              </Badge>
            </p>
          </div>
          <p className="text-3xl font-extrabold text-navy-900">
            <Money kobo={product.price_kobo} />
          </p>
          <ShareButtons
            url={`${SITE}/products/${product.id}`}
            title={product.name}
            text={`${product.name} from ${vendor.name} on AFIT Market:`}
            heading="Share this item"
          />
          <p>
            {product.available ? (
              <Badge tone="success">Available</Badge>
            ) : (
              <Badge tone="danger">Sold out</Badge>
            )}
          </p>
          {product.description && <p className="leading-relaxed">{product.description}</p>}
          {!vendor.open_now && (
            <p
              role="status"
              className="rounded-[var(--radius-control)] bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700"
            >
              The shop is closed now. You can add this to your cart, but checkout opens when it
              reopens.
            </p>
          )}
          <div className="rounded-[var(--radius-card)] border border-line bg-card p-4 shadow-[var(--shadow-card)]">
            <AddToCartForm product={product} orderable={product.available} />
          </div>
          {canWish ? (
            <WishlistButton productId={product.id} saved={saved} />
          ) : (
            !who.authenticated && (
              <Link
                href={`/login?next=/products/${product.id}`}
                className="inline-flex items-center gap-2 font-bold text-brand-700 hover:underline"
              >
                <Icon name="heart" size={18} /> Sign in to save this item
              </Link>
            )
          )}
          <ul className="grid gap-2 text-sm text-muted sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <Icon name="check-circle" size={18} className="text-success-700" /> Prices are checked
              again at checkout
            </li>
            <li className="flex items-center gap-2">
              <Icon name="truck" size={18} className="text-brand-700" /> Pickup or delivery to an
              approved point
            </li>
          </ul>
        </div>
      </div>
      {more.length > 0 && (
        <Section title={`More from ${vendor.name}`} id="more" className="mt-10">
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {more.map((p) => (
              <li key={p.id}>
                <ProductCard
                  href={`/products/${p.id}`}
                  name={p.name}
                  vendorName={vendor.name}
                  priceKobo={p.price_kobo}
                  available={p.available}
                  openNow={vendor.open_now}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}
