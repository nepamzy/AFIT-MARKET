import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CustomerReturnForm, OpenCaseForm } from '@/components/domain/support-forms'
import { Card, PageHeader } from '@/components/ui/card'
import { getOrder } from '@/server/modules/orders-and-state-machine/queries'
import { getItemBalances, listMyCases, listReturns } from '@/server/modules/support/queries'

export const metadata: Metadata = { title: 'Help with an order' }

const RETURN_STATUS: Record<string, string> = {
  requested: 'Waiting for support',
  approved: 'Approved: you may send the item back',
  rejected: 'Not approved',
  received_by_vendor: 'The shop has the item',
  closed: 'Closed',
}
const RETURNABLE = [
  'COMPLETED',
  'DELIVERED',
  'DISPUTED',
  'RETURN_REQUESTED',
  'RETURN_IN_PROGRESS',
  'RETURNED_TO_VENDOR',
  'PARTIALLY_REFUNDED',
]

export default async function OrderHelp({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  const found = await getOrder(id)
  if (!found) notFound()
  const { order } = found
  const [balances, returns, cases] = await Promise.all([
    getItemBalances(id),
    listReturns(id),
    listMyCases(),
  ])
  const mine = cases.filter((c) => c.order_number === order.order_number)
  const items = balances ?? []
  return (
    <>
      <p className="mb-2">
        <Link href={`/orders/${id}`} className="font-semibold text-brand-700 underline">
          ← Back to order {order.order_number}
        </Link>
      </p>
      <PageHeader
        title="Help with this order"
        subtitle={`${order.order_number} · ${order.vendor_name}`}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">Report a problem</h2>
          <p className="text-sm text-muted">
            Tell us what went wrong. A person reads every report. Report it the same day you receive
            your order. Reports do not lead to refunds.
          </p>
          {order.status === 'PENDING_PAYMENT' ? (
            <p>You can report a problem once the order is paid.</p>
          ) : (
            <OpenCaseForm orderId={id} existing={mine.length} />
          )}
          {mine.length > 0 && (
            <ul className="space-y-1 text-sm">
              {mine.map((c) => (
                <li key={c.id}>
                  <Link className="font-semibold text-brand-700 underline" href={`/cases/${c.id}`}>
                    {c.case_no}
                  </Link>{' '}
                  · {c.case_type.replaceAll('_', ' ')} · {c.status.replaceAll('_', ' ')}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3 lg:col-span-2">
          <h2 className="text-lg font-bold">Returns</h2>
          {returns.length > 0 && (
            <ul className="space-y-2" aria-label="Your return requests">
              {returns.map((r) => (
                <li key={r.id} className="rounded-[var(--radius-control)] border border-line p-3">
                  <p className="font-semibold">{RETURN_STATUS[r.status] ?? r.status}</p>
                  <p className="text-sm">
                    {r.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
                  </p>
                  {r.decision_reason && (
                    <p className="text-sm text-muted">Decision: {r.decision_reason}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {RETURNABLE.includes(order.status) ? (
            <CustomerReturnForm orderId={id} items={items} existing={returns.length} />
          ) : (
            <p>You can ask to return items once the order has finished.</p>
          )}
        </Card>
      </div>
    </>
  )
}
