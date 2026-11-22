import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/card'
import { Card } from '@/components/ui/card'
import { MetricCard, MetricGrid } from '@/components/ui/metric-card'
import { ProductPhoto } from '@/components/ui/product-photo'
import { WhatsAppLink } from '@/components/landing/whatsapp'
import { Money } from '@/components/ui/money'
import { EmptyState } from '@/components/ui/states'
import {
  archiveProductAction,
  toggleAvailabilityAction,
} from '@/server/modules/vendors-and-catalogue/actions'
import { getMyVendor, listProducts } from '@/server/modules/vendors-and-catalogue/vendor-queries'

export const metadata: Metadata = { title: 'Catalogue' }

export default async function Catalogue() {
  const vendor = await getMyVendor()
  if (!vendor) return <EmptyState title="No vendor account yet" />
  const products = await listProducts(vendor.id)
  const onSale = products.filter((p) => p.is_available && p.stock_quantity !== 0).length
  const approved = vendor.status === 'approved'
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Shop', href: '/vendor' }, { label: 'Catalogue' }]}
        title="Catalogue"
        subtitle="Your menu as customers see it"
        actions={
          approved ? (
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/vendor/catalogue/quick-add" variant="gold">
                Add from the list
              </ButtonLink>
              <ButtonLink href="/vendor/catalogue/new" variant="secondary">
                Add my own item
              </ButtonLink>
            </div>
          ) : undefined
        }
      />
      <MetricGrid>
        <MetricCard label="Items on your menu" value={products.length} icon="package" />
        <MetricCard label="On sale now" value={onSale} icon="check-circle" accent="success" />
        <MetricCard
          label="Sold out or hidden"
          value={products.length - onSale}
          icon="alert"
          accent="gold"
        />
      </MetricGrid>
      <Alert tone="info" plain title="Photos">
        Add a photo to each item: items with a clear photo sell better. Customers see a simple
        placeholder tile for items without one.
      </Alert>
      <Alert tone="info" plain title="Many items?">
        <span className="flex flex-wrap items-center gap-3">
          <span>
            If you have a lot of items, contact us and we will help you put them on your menu.
          </span>
          <WhatsAppLink label="Message us on WhatsApp" />
        </span>
      </Alert>
      <div className="mt-4">
        {products.length === 0 ? (
          <EmptyState
            title="Your menu is empty"
            action={<ButtonLink href="/vendor/catalogue/quick-add">Add from the list</ButtonLink>}
          >
            Customers can only see items you add here.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {products.map((p) => (
              <li key={p.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <Link
                    href={`/vendor/catalogue/${p.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:bg-brand-50"
                    aria-label={`Open ${p.name} to edit`}
                  >
                    <ProductPhoto
                      productId={p.id}
                      icon="bag"
                      fresh
                      className="aspect-square! w-12! shrink-0 rounded-lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-sm text-muted">
                        {[
                          p.section,
                          p.stock_quantity === null
                            ? 'Unlimited stock'
                            : `${p.stock_quantity} in stock`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="block text-sm font-semibold text-brand-700">
                        Tap to open and edit
                      </span>
                    </span>
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <Money kobo={p.price_kobo} className="font-semibold" />
                    <Badge tone={p.is_available && p.stock_quantity !== 0 ? 'success' : 'neutral'}>
                      {p.is_available && p.stock_quantity !== 0 ? 'On sale' : 'Sold out'}
                    </Badge>
                    <form action={toggleAvailabilityAction}>
                      <input type="hidden" name="productId" value={p.id} />
                      <input type="hidden" name="available" value={p.is_available ? '0' : '1'} />
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={vendor.status !== 'approved'}
                      >
                        {p.is_available ? 'Mark sold out' : 'Put back on sale'}
                      </Button>
                    </form>
                    <form action={archiveProductAction}>
                      <input type="hidden" name="productId" value={p.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        disabled={vendor.status !== 'approved'}
                        aria-label={`Remove ${p.name} from menu`}
                      >
                        Remove
                      </Button>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
