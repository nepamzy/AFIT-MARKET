import { lagosDateTime } from '@/lib/time'
import type { Metadata } from 'next'
import Link from 'next/link'
import { OrderStatusPill } from '@/components/domain/order-status'
import { BarChart } from '@/components/ui/bar-chart'
import { ButtonLink } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { type IconName } from '@/components/ui/icons'
import { MetricCard, MetricGrid } from '@/components/ui/metric-card'
import { Money } from '@/components/ui/money'
import { Section } from '@/components/ui/section'
import { EmptyState } from '@/components/ui/states'
import { formatNaira } from '@/lib/money'
import { adminDashboard } from '@/server/modules/admin/queries'
import { adminOverview } from '@/server/modules/engagement/queries'

export const metadata: Metadata = { title: 'Administration' }

const ATTENTION: Record<string, [string, string]> = {
  cases_open: ['Open reports', '/admin/cases'],
  cases_awaiting_close: ['Decided reports awaiting close', '/admin/cases'],
  returns_waiting: ['Returns waiting for a decision', '/admin/returns'],
  review_reports_open: ['Open review reports', '/admin/reviews'],
  rider_issues_open: ['Open rider issues', '/admin/rider-issues'],
  deliveries_in_flight: ['Deliveries in progress', '/admin/orders'],
  payment_flags_open: ['Open payment flags', '/admin/payments'],
  vendor_applications_pending: ['Vendor applications pending', '/admin/applications'],
  rider_applications_pending: ['Rider applications pending', '/admin/applications'],
  notifications_dead: ['Notifications that failed for good', '/admin/jobs'],
  notifications_stuck: ['Notifications stuck in processing', '/admin/jobs'],
}
const ACTIONS: [string, string, IconName][] = [
  ['/admin/users', 'Manage users', 'users'],
  ['/admin/vendors', 'Manage vendors', 'store'],
  ['/admin/riders', 'Manage riders', 'bike'],
  ['/admin/orders', 'View orders', 'package'],
  ['/admin/reports', 'View reports', 'chart'],
  ['/admin/settings', 'Platform settings', 'sliders'],
]

export default async function AdminHome() {
  const [d, overview] = await Promise.all([adminDashboard(), adminOverview()])
  const attention = Object.entries(overview ?? {})
  const waiting = attention.filter(([, v]) => v > 0).length
  const emergency = {
    reports: (overview?.cases_open ?? 0) + (overview?.cases_awaiting_close ?? 0),
    returns: overview?.returns_waiting ?? 0,
  }
  const emergencyTotal = emergency.reports + emergency.returns
  return (
    <>
      <PageHeader
        title="Admin dashboard"
        subtitle="System overview and key numbers. Every figure comes from the live database."
        actions={
          <ButtonLink href="/admin/reports" variant="secondary">
            View reports
          </ButtonLink>
        }
      />
      <Link
        href="/admin/emergency"
        className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border-2 p-4 shadow-[var(--shadow-card)] ${emergencyTotal > 0 ? 'border-danger-600 bg-danger-50' : 'border-line bg-card'}`}
      >
        <span>
          <span className="block text-lg font-extrabold text-navy-900">
            Emergency: reports and returns
          </span>
          <span className="text-sm text-muted">
            {emergencyTotal > 0
              ? `${emergency.reports} report${emergency.reports === 1 ? '' : 's'} · ${emergency.returns} return${emergency.returns === 1 ? '' : 's'}`
              : 'Nothing is waiting for you right now.'}
          </span>
        </span>
        <span className="font-bold text-brand-700">Open →</span>
      </Link>
      {!d ? (
        <EmptyState title="We could not load the dashboard" icon="alert">
          Please refresh the page. If it keeps happening, check the jobs page and the audit trail.
        </EmptyState>
      ) : (
        <>
          <MetricGrid>
            <MetricCard
              label="Orders (all time)"
              value={d.orders_total}
              note={`${d.orders_7d} in the last 7 days`}
              icon="package"
              href="/admin/orders"
            />
            <MetricCard
              label="Payments received"
              value={
                d.payments_received_kobo === null
                  ? 'Not shown'
                  : formatNaira(d.payments_received_kobo)
              }
              note={
                d.payments_received_kobo === null
                  ? 'Finance and administrators only'
                  : `${formatNaira(d.payments_received_7d_kobo ?? 0)} in the last 7 days (per ledger)`
              }
              icon="coins"
              accent="success"
              href="/admin/payments"
            />
            <MetricCard
              label="Approved vendors"
              value={d.vendors_approved}
              note={`${d.vendors_pending} application${d.vendors_pending === 1 ? '' : 's'} pending`}
              icon="store"
              accent="gold"
              href="/admin/vendors"
            />
            <MetricCard
              label="Approved riders"
              value={d.riders_approved}
              note={`${d.orders_active} order${d.orders_active === 1 ? '' : 's'} in progress`}
              icon="bike"
              accent="danger"
              href="/admin/riders"
            />
          </MetricGrid>
          <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card>
              <h2 className="mb-2 text-lg font-extrabold text-navy-900">Orders, last 14 days</h2>
              <BarChart
                label="Orders per day over the last 14 days"
                data={d.orders_by_day.map((x) => ({
                  label: new Date(x.day).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                  }),
                  value: x.orders,
                }))}
              />
            </Card>
            <Card>
              <h2 className="mb-3 text-lg font-extrabold text-navy-900">Quick actions</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {ACTIONS.map(([href, label]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="touch-target flex items-center justify-between rounded-[var(--radius-control)] border border-line px-3 py-2 font-bold text-navy-900 hover:bg-brand-50"
                    >
                      {label} <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Section
            title="Recent orders"
            id="recent"
            actions={
              <Link href="/admin/orders" className="font-bold text-brand-700 hover:underline">
                View all →
              </Link>
            }
          >
            <DataTable
              caption="Recent orders"
              rows={d.recent_orders}
              rowKey={(o) => o.id}
              empty={
                <EmptyState title="No orders yet" icon="package">
                  Orders appear here as customers place them.
                </EmptyState>
              }
              columns={[
                {
                  header: 'Order',
                  cell: (o) => (
                    <Link
                      className="font-bold text-brand-700 hover:underline"
                      href={`/admin/orders/${o.id}`}
                    >
                      {o.order_number}
                    </Link>
                  ),
                },
                { header: 'Shop', cell: (o) => o.vendor_name },
                { header: 'Total', align: 'right', cell: (o) => <Money kobo={o.total_kobo} /> },
                { header: 'Status', cell: (o) => <OrderStatusPill code={o.status} /> },
                { header: 'Placed', cell: (o) => lagosDateTime(o.created_at) },
              ]}
            />
          </Section>
        </>
      )}
      <Section
        title="Needs attention"
        id="todo"
        description={
          waiting === 0
            ? 'Nothing is waiting: reports, applications and background jobs are all clear.'
            : `${waiting} ${waiting === 1 ? 'queue has' : 'queues have'} items waiting. Queues you can see are listed; empty ones are dimmed.`
        }
      >
        {attention.length === 0 ? (
          <EmptyState title="No queues to show" icon="check-circle">
            Your role has no work queues.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map(([k, v]) => {
              const [label, href] = ATTENTION[k] ?? [k.replaceAll('_', ' '), '/admin']
              return (
                <li key={k}>
                  <Link
                    href={href}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-card p-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-pop)]"
                  >
                    <span className="text-sm font-semibold text-muted">{label}</span>
                    <span
                      className={`text-2xl font-extrabold ${v > 0 ? 'text-navy-900' : 'text-muted'}`}
                    >
                      {v}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </>
  )
}
