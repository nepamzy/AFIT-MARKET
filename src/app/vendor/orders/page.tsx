import { lagosDateTime } from '@/lib/time'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AutoRefresh } from '@/components/domain/auto-refresh'
import { AssignRiderForm } from '@/components/domain/assign-rider-form'
import { VendorOrderActions } from '@/components/domain/vendor-order-actions'
import { OrderStatusPill } from '@/components/domain/order-status'
import { PageHeader } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { EmptyState } from '@/components/ui/states'
import { Table, Td } from '@/components/ui/table'
import { MetricCard, MetricGrid } from '@/components/ui/metric-card'
import { Pager } from '@/components/ui/pager'
import {
  listItemsForOrders,
  listOrders,
  listOrdersPage,
  type OrderRow,
} from '@/server/modules/orders-and-state-machine/queries'
import {
  getMyVendor,
  listRiderTeam,
  type RiderTeamMember,
} from '@/server/modules/vendors-and-catalogue/vendor-queries'

export const metadata: Metadata = { title: 'Vendor orders' }

function OrdersTable({
  caption,
  orders,
  items,
  riders,
}: {
  caption: string
  orders: OrderRow[]
  items: Awaited<ReturnType<typeof listItemsForOrders>>
  riders: RiderTeamMember[]
}) {
  return (
    <Table caption={caption} head={['Order', 'Type', 'Items', 'Placed', 'Status', 'Next step']}>
      {orders.map((o) => (
        <tr key={o.id}>
          <Td>
            <span className="font-semibold">{o.order_number}</span>
          </Td>
          <Td>{o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}</Td>
          <Td>
            <ul className="space-y-0.5 text-sm">
              {(items.get(o.id) ?? []).map((i) => (
                <li key={i.id}>
                  {i.quantity} × {i.product_name}
                  {i.options.length > 0 && ` (${i.options.map((x) => x.name).join(', ')})`}
                </li>
              ))}
            </ul>
            <Money kobo={o.items_total_kobo} className="font-semibold" />
          </Td>
          <Td>{lagosDateTime(o.created_at)}</Td>
          <Td>
            <OrderStatusPill code={o.status} atDoor={o.payment_timing === 'on_delivery'} />
            {!['PENDING_PAYMENT', 'CANCELLED'].includes(o.status) &&
              (o.payment_timing === 'on_delivery' ? (
                <p className="mt-1 text-xs font-semibold text-warning-700">
                  Customer pays when they receive it
                </p>
              ) : (
                <p className="mt-1 text-xs font-semibold text-success-700">✓ Payment confirmed</p>
              ))}
          </Td>
          <Td>
            <VendorOrderActions orderId={o.id} status={o.status} />
            {o.fulfilment === 'delivery' && ['READY', 'AWAITING_RIDER'].includes(o.status) && (
              <AssignRiderForm orderId={o.id} riders={riders} current={o.assigned_rider_id} />
            )}
          </Td>
        </tr>
      ))}
    </Table>
  )
}

/**
 * Unfinished orders are always listed (oldest first, however many newer orders exist), so a busy shop can never lose an order
 * that still needs action. Finished orders follow, newest first, a page at a time.
 */
export default async function VendorOrders({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const n = Number((await searchParams).page)
  const page = Number.isInteger(n) && n >= 1 ? n : 1
  const vendor = await getMyVendor()
  const open = vendor
    ? await listOrders({ vendorId: vendor.id, finished: false, oldestFirst: true, limit: 200 })
    : []
  const done = vendor
    ? await listOrdersPage({ vendorId: vendor.id, finished: true, page, pageSize: 25 })
    : { orders: [] as OrderRow[], hasMore: false }
  const riders = vendor ? await listRiderTeam(vendor.id) : []
  const items = await listItemsForOrders([...open, ...done.orders].map((o) => o.id))
  return (
    <>
      <AutoRefresh everySeconds={15} />
      <PageHeader
        breadcrumbs={[{ label: 'Shop', href: '/vendor' }, { label: 'Orders' }]}
        title="Orders"
        subtitle="Paid orders are already confirmed by Paystack. Accept or decline, then mark ready."
      />
      <MetricGrid>
        <MetricCard
          label="Needs your attention"
          value={open.length}
          icon="clipboard"
          accent="gold"
        />
        <MetricCard
          label="Finished on this page"
          value={done.orders.length}
          note="Completed, cancelled or unpaid"
          icon="check-circle"
          accent="success"
        />
      </MetricGrid>
      {open.length === 0 && done.orders.length === 0 && page === 1 ? (
        <EmptyState title="No orders yet">New orders will appear here.</EmptyState>
      ) : (
        <div className="space-y-8">
          {page === 1 && (
            <section aria-labelledby="open-orders">
              <h2 id="open-orders" className="mb-2 text-lg font-bold">
                Needs your attention ({open.length})
              </h2>
              {open.length === 0 ? (
                <p className="text-muted">Nothing is waiting for you.</p>
              ) : (
                <OrdersTable
                  caption="Unfinished orders for your shop"
                  orders={open}
                  items={items}
                  riders={riders}
                />
              )}
            </section>
          )}
          <section aria-labelledby="done-orders">
            <h2 id="done-orders" className="mb-2 text-lg font-bold">
              Finished and unpaid orders
            </h2>
            {done.orders.length === 0 ? (
              <p className="text-muted">Nothing here yet.</p>
            ) : (
              <OrdersTable
                caption="Finished orders for your shop"
                orders={done.orders}
                items={items}
                riders={riders}
              />
            )}
            <Pager basePath="/vendor/orders" page={page} hasMore={done.hasMore} />
          </section>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        <Link href="/vendor" className="underline">
          Back to dashboard
        </Link>
      </p>
    </>
  )
}
