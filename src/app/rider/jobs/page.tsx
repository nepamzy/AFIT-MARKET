import { RiderPaymentGate } from '@/components/domain/pay-at-door-notice'
import { RiderHandoff } from '@/components/domain/rider-handoff'
import { AutoRefresh } from '@/components/domain/auto-refresh'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AcceptButton,
  ArrivedButton,
  LocationSharing,
  ReportIssueForm,
  StartRouteButton,
} from '@/components/domain/rider-controls'
import { PickupScanCard } from '@/components/domain/pickup-scan-card'
import { RiderJobMap } from '@/components/domain/rider-job-map'
import { CustomerContactCard } from '@/components/domain/customer-contact-card'
import { OrderStatusPill } from '@/components/domain/order-status'
import { Alert } from '@/components/ui/alert'
import { Card, PageHeader } from '@/components/ui/card'
import { customerNamesByOrder } from '@/server/modules/orders-and-state-machine/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { MetricCard, MetricGrid } from '@/components/ui/metric-card'
import { Stepper } from '@/components/ui/stepper'
import { EmptyState } from '@/components/ui/states'
import {
  getAssignments,
  getMyRider,
  getOffers,
  locationSettings,
} from '@/server/modules/riders/queries'

export const metadata: Metadata = { title: 'Jobs' }

export default async function Jobs() {
  const me = await getMyRider()
  if (!me)
    return (
      <EmptyState title="Your rider account is not available">Contact an administrator.</EmptyState>
    )
  if (!me.active)
    return (
      <>
        <PageHeader
          breadcrumbs={[{ label: 'Rider', href: '/rider' }, { label: 'Jobs' }]}
          title="Jobs"
        />
        <EmptyState title="You are off duty">
          Go active from{' '}
          <Link className="font-semibold underline" href="/rider">
            Rider home
          </Link>{' '}
          to see delivery offers.
        </EmptyState>
      </>
    )
  const [assignments, offers, s, link] = await Promise.all([
    getAssignments(),
    getOffers(),
    locationSettings(),
    (await createSupabaseServerClient()).rpc('my_rider_link'),
  ])
  const shop = (link.data as { vendor_name?: string } | null)?.vendor_name
  const customerNames = await customerNamesByOrder(assignments.map((a) => a.order_id))
  return (
    <>
      <AutoRefresh everySeconds={assignments.some((a) => a.arrival_detected_at) ? 4 : 15} />
      <PageHeader
        breadcrumbs={[{ label: 'Rider', href: '/rider' }, { label: 'Jobs' }]}
        title="Jobs"
        subtitle={`${assignments.length} of 5 active deliveries`}
      />
      {shop ? (
        <p className="mb-4 rounded-[var(--radius-control)] bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
          You deliver for {shop}. You see only this shop&apos;s orders.
        </p>
      ) : (
        <Alert tone="warning" title="You are not linked to a shop" className="mb-4">
          Riders work for one shop and see only its orders.{' '}
          <Link className="font-semibold underline" href="/rider/join-shop">
            Enter a shop&apos;s rider code
          </Link>
          .
        </Alert>
      )}
      <MetricGrid>
        <MetricCard
          label="Active deliveries"
          value={`${assignments.length} of 5`}
          icon="truck"
          accent="gold"
        />
        <MetricCard
          label="Delivery offers"
          value={offers.length}
          note="Ready for collection near you"
          icon="package"
        />
      </MetricGrid>
      <div className="mb-5">
        <LocationSharing
          enabled={assignments.length > 0}
          minIntervalSeconds={Math.max(s.minIntervalSeconds, s.sendIntervalSeconds)}
          maxAccuracyM={s.maxAccuracyM}
          maxAgeSeconds={s.maxAgeSeconds}
        />
      </div>

      <section aria-labelledby="mine" className="mb-6 space-y-3">
        <h2 id="mine" className="text-lg font-bold">
          My deliveries
        </h2>
        {assignments.length === 0 ? (
          <EmptyState title="No accepted deliveries">Accept an offer below.</EmptyState>
        ) : (
          assignments.map((a) => (
            <Card key={a.assignment_id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-extrabold text-navy-900">
                  {customerNames.get(a.order_id) ?? 'Customer'}
                </span>
                <span className="font-bold text-muted">
                  #{a.sequence} · {a.order_number}
                </span>
                <OrderStatusPill code={a.order_status} />
              </div>
              <Stepper
                steps={['Accepted', 'Picked up', 'On the way', 'Arrived']}
                current={
                  a.arrival_detected_at
                    ? 3
                    : a.status === 'en_route'
                      ? 2
                      : a.status === 'picked_up'
                        ? 1
                        : 0
                }
              />
              <RiderJobMap
                assignmentId={a.assignment_id}
                mapKey={process.env.ARCGIS_API_KEY ?? null}
              />
              <p>
                <strong>Collect from:</strong> {a.vendor_name}
                {a.pickup ? ` · ${a.pickup}` : ''}
              </p>
              <p>
                <strong>Deliver to:</strong> {a.deliver_to}
              </p>
              <CustomerContactCard assignmentId={a.assignment_id} />
              {a.status === 'accepted' && <PickupScanCard />}
              {a.status === 'picked_up' && <StartRouteButton assignmentId={a.assignment_id} />}
              {a.status === 'en_route' && !a.arrival_detected_at && (
                <div className="space-y-2">
                  <p className="text-sm text-muted">
                    On the way. When you reach the customer, tap the button. If your GPS notices
                    first, the hand-over opens by itself.
                  </p>
                  <ArrivedButton assignmentId={a.assignment_id} />
                </div>
              )}
              {a.arrival_detected_at && (
                <RiderPaymentGate orderId={a.order_id}>
                  <RiderHandoff orderId={a.order_id} orderNumber={a.order_number} />
                </RiderPaymentGate>
              )}
              <ReportIssueForm assignmentId={a.assignment_id} />
            </Card>
          ))
        )}
      </section>

      <section aria-labelledby="offers" className="space-y-3">
        <h2 id="offers" className="text-lg font-bold">
          Delivery offers
        </h2>
        {offers.length === 0 ? (
          <EmptyState title="No offers right now">
            New deliveries appear here when a vendor marks an order ready.
          </EmptyState>
        ) : (
          offers.map((o) => (
            <Card key={o.order_id} className="space-y-2">
              <p className="font-bold">{o.order_number}</p>
              <p>
                <strong>Collect from:</strong> {o.vendor_name}
                {o.pickup ? ` · ${o.pickup}` : ''}
              </p>
              <p>
                <strong>Deliver to:</strong> {o.deliver_to}
              </p>
              <AcceptButton orderId={o.order_id} />
            </Card>
          ))
        )}
      </section>
    </>
  )
}
