import type { Metadata } from 'next'
import { ShopRiderMap } from '@/components/domain/shop-rider-map'
import { RiderPickupCard } from '@/components/domain/rider-pickup-card'
import { FindByCode } from '@/components/domain/find-by-code'
import { VendorLocationBeacon } from '@/components/domain/vendor-location-beacon'
import { AutoRefresh } from '@/components/domain/auto-refresh'
import { PickupHandoverCard } from '@/components/domain/pickup-handover-card'
import { Alert } from '@/components/ui/alert'
import { Card, PageHeader } from '@/components/ui/card'
import { MetricCard, MetricGrid } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/states'
import { listPendingRiderPickups } from '@/server/modules/riders/queries'
import { listOrders } from '@/server/modules/orders-and-state-machine/queries'
import { getMyVendor } from '@/server/modules/vendors-and-catalogue/vendor-queries'

export const metadata: Metadata = { title: 'Confirm handover' }

export default async function Handover({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>
}) {
  const { done } = await searchParams
  const vendor = await getMyVendor()
  const waiting = vendor
    ? await listOrders({
        vendorId: vendor.id,
        statuses: ['PICKUP_AWAITING_HANDOVER'],
        oldestFirst: true,
        limit: 200,
      })
    : []
  const riderPickups = vendor ? await listPendingRiderPickups() : []
  return (
    <>
      <VendorLocationBeacon />
      <AutoRefresh everySeconds={5} />
      <PageHeader
        breadcrumbs={[{ label: 'Shop', href: '/vendor' }, { label: 'Handover' }]}
        title="Confirm handover"
        subtitle="The customer shows a pickup code, then signs for the order."
      />
      {(done === 'rider' || done === 'pickup') && (
        <Alert tone="success" title="Handed over">
          {done === 'rider'
            ? 'The parcel is with the rider and the order is now on its way to the customer.'
            : 'Handover complete. The customer can open their receipt now.'}
        </Alert>
      )}
      <MetricGrid>
        <MetricCard
          label="Customer pickups waiting"
          value={waiting.length}
          note="Customer shows a code, then signs"
          icon="check-circle"
          accent="gold"
        />
        <MetricCard
          label="Riders collecting"
          value={riderPickups.length}
          note="They sign, or scan your QR code"
          icon="truck"
        />
      </MetricGrid>
      {riderPickups.length > 0 && (
        <section aria-labelledby="rp" className="mb-8 space-y-4">
          <h2 id="rp" className="text-lg font-bold">
            Rider collecting a delivery
          </h2>
          {riderPickups.map((p) => (
            <Card key={p.order_id} className="space-y-3">
              <p className="font-bold">{p.order_number}</p>
              <p>
                Assigned rider: <strong>{p.rider_name}</strong>. Hand the order to this person only.
                They sign on your phone, or scan your QR code with theirs.
              </p>
              <ShopRiderMap orderId={p.order_id} mapKey={process.env.ARCGIS_API_KEY ?? null} />
              <RiderPickupCard orderId={p.order_id} />
            </Card>
          ))}
        </section>
      )}
      <h2 className="mb-3 text-lg font-bold">Customer pickups</h2>
      {waiting.length > 0 && <FindByCode />}
      {waiting.length === 0 ? (
        <EmptyState title="Nothing waiting for pickup">
          Orders you mark as ready for pickup appear here.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {waiting.map((o) => (
            <Card key={o.id} id={`order-${o.id}`} className="space-y-3">
              <h2 className="text-lg font-bold">{o.order_number}</h2>
              <PickupHandoverCard orderId={o.id} />
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
