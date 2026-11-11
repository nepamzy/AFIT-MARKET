import type { Metadata } from 'next'
import { BarChart } from '@/components/ui/bar-chart'
import { Card, PageHeader } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { LinkTabs } from '@/components/ui/list-controls'
import { MetricCard, MetricGrid } from '@/components/ui/metric-card'
import { Section } from '@/components/ui/section'
import { EmptyState } from '@/components/ui/states'
import { formatNaira } from '@/lib/money'
import { adminAnalytics } from '@/server/modules/admin/queries'

export const metadata: Metadata = { title: 'Analytics' }

const RANGES = [7, 30, 90] as const
const DEVICE: Record<string, string> = {
  android: 'Android phone',
  ios: 'iPhone or iPad',
  desktop: 'Computer',
  other: 'Other',
}
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '–')
const day = (d: string) =>
  new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const n = Number((await searchParams).days)
  const days = (RANGES as readonly number[]).includes(n) ? n : 30
  const a = await adminAnalytics(days)
  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Visits, sign-ups, app installs and sales. Visits are counted once per browser session, with no cookies."
        breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'Analytics' }]}
      />
      <LinkTabs
        label="Period"
        active={String(days)}
        tabs={RANGES.map((d) => ({
          key: String(d),
          label: `Last ${d} days`,
          href: `/admin/analytics?days=${d}`,
        }))}
      />
      {!a ? (
        <EmptyState title="We could not load analytics" icon="alert">
          Please try again.
        </EmptyState>
      ) : (
        <>
          <MetricGrid>
            <MetricCard
              label="Visits"
              value={a.visits}
              note="One per browser session"
              icon="users"
            />
            <MetricCard
              label="New sign-ups"
              value={a.new_users}
              note={`${a.users_total} people in all`}
              icon="user"
              accent="gold"
            />
            <MetricCard
              label="App installs"
              value={a.app_installs}
              note={`${a.app_opens} opens of the installed app`}
              icon="phone"
            />
            <MetricCard label="Visit to sign-up" value={pct(a.new_users, a.visits)} icon="chart" />
          </MetricGrid>
          <MetricGrid>
            <MetricCard
              label="Orders"
              value={a.orders}
              note={`${a.buyers} different buyers`}
              icon="package"
            />
            <MetricCard
              label="Sales"
              value={formatNaira(a.sales_kobo)}
              note="Payments received, per the ledger"
              icon="coins"
              accent="success"
            />
            <MetricCard
              label="Alerts turned on"
              value={pct(a.users_with_alerts, a.users_total)}
              note={`${a.users_with_alerts} people`}
              icon="bell"
            />
            <MetricCard
              label="Sign-up to first order"
              value={pct(a.buyers, a.new_users)}
              note="Buyers this period over new sign-ups"
              icon="chart"
            />
          </MetricGrid>
          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 text-lg font-extrabold text-navy-900">Visits per day</h2>
              <BarChart
                label={`Visits per day, last ${days} days`}
                data={a.by_day.map((d) => ({ label: day(d.day), value: d.visits }))}
              />
            </Card>
            <Card>
              <h2 className="mb-2 text-lg font-extrabold text-navy-900">New sign-ups per day</h2>
              <BarChart
                label={`New sign-ups per day, last ${days} days`}
                data={a.by_day.map((d) => ({ label: day(d.day), value: d.signups }))}
              />
            </Card>
          </div>
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <Section
              title="Where visitors came from"
              id="sources"
              description="Add ?src=flyer or ?src=whatsapp to a link to tag it"
            >
              <DataTable
                caption="Visits by source"
                rows={a.visits_by_source}
                rowKey={(s) => s.source}
                empty={<EmptyState title="No visits counted yet" icon="users" />}
                columns={[
                  { header: 'Source', cell: (s) => s.source },
                  { header: 'Visits', align: 'right', cell: (s) => s.n },
                  { header: 'Share', align: 'right', cell: (s) => pct(s.n, a.visits) },
                ]}
              />
            </Section>
            <Section
              title="Devices"
              id="devices"
              description="Visits, and app installs on Android (iPhone installs cannot be counted)"
            >
              <DataTable
                caption="Visits by device"
                rows={a.visits_by_device}
                rowKey={(s) => s.device}
                empty={<EmptyState title="No visits counted yet" icon="phone" />}
                columns={[
                  { header: 'Device', cell: (s) => DEVICE[s.device] ?? s.device },
                  { header: 'Visits', align: 'right', cell: (s) => s.n },
                  {
                    header: 'Installs',
                    align: 'right',
                    cell: (s) => a.installs_by_device.find((i) => i.device === s.device)?.n ?? 0,
                  },
                ]}
              />
            </Section>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Busiest shops" id="vendors" description="By number of orders placed">
              <DataTable
                caption="Busiest shops"
                rows={a.top_vendors}
                rowKey={(v) => v.vendor_name}
                empty={<EmptyState title="No orders in this period" icon="store" />}
                columns={[
                  { header: 'Shop', cell: (v) => v.vendor_name },
                  { header: 'Orders', align: 'right', cell: (v) => v.orders },
                ]}
              />
            </Section>
            <Card>
              <h2 className="mb-2 text-lg font-extrabold text-navy-900">More detail</h2>
              <p className="text-sm text-muted">
                Pages, countries and referring sites are in Vercel Web Analytics (Vercel dashboard,
                project afit-market, Analytics). If a Google tag id is set, Google Analytics has its
                own reports as well.
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  )
}
