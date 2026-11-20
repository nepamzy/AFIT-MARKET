import { randomUUID } from 'node:crypto'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CheckoutForm } from '@/components/domain/checkout-form'
import { PageHeader } from '@/components/ui/card'
import { Stepper } from '@/components/ui/stepper'
import { EmptyState } from '@/components/ui/states'
import { ButtonLink } from '@/components/ui/button'
import { getMultiQuote, listDeliveryPoints } from '@/server/modules/cart-and-checkout/queries'
import { listSavedPlaces } from '@/server/modules/customer/queries'

export const metadata: Metadata = { title: 'Checkout' }

export default async function CheckoutPage() {
  const [points, places] = await Promise.all([listDeliveryPoints(), listSavedPlaces()])
  const preferred = places.find((s) => s.is_default && s.point_active)?.delivery_point_id
  const q = await getMultiQuote({}, null, false)
  if (!q)
    return <EmptyState title="We could not load checkout">Please try again in a moment.</EmptyState>
  if (q.empty) redirect('/cart')
  return (
    <>
      <PageHeader
        title="Checkout"
        subtitle={
          q.groups.length === 1
            ? `Order from ${q.groups[0]!.vendor_name}`
            : `Orders from ${q.groups.length} shops`
        }
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Cart', href: '/cart' },
          { label: 'Checkout' },
        ]}
      />
      <Stepper steps={['Delivery', 'Payment', 'Confirmation']} current={0} />
      {/* The key is created per page view; if the form is submitted twice, the server returns the same orders. */}
      <CheckoutForm
        initial={q}
        deliveryAvailable={points.length > 0}
        points={points}
        defaultPoint={preferred}
        idempotencyKey={`co-${randomUUID()}`}
      />
      <p className="mt-4">
        <ButtonLink href="/cart" variant="ghost">
          ← Back to cart
        </ButtonLink>
      </p>
    </>
  )
}
