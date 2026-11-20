import { lagosDateTime } from '@/lib/time'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { listReturns, staffListCases, staffListRefunds } from '@/server/modules/support/queries'

export const metadata: Metadata = { title: 'Emergency' }
export const dynamic = 'force-dynamic'

/** Everything that needs a person right now, in one place: customer reports, return requests, and refunds waiting. */
export default async function Emergency() {
  const [open, review, returns] = await Promise.all([
    staffListCases('open', 1),
    staffListCases('under_review', 1),
    listReturns(),
  ])
  const reports = [...open, ...review]
  const waitingReturns = returns.filter((r) => r.status === 'requested')
  const section = (title: string, count: number, href: string) => (
    <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-lg font-extrabold text-navy-900">
      <span>
        {title} <Badge tone={count > 0 ? 'danger' : 'success'}>{count}</Badge>
      </span>
      <Link href={href} className="text-sm font-bold text-brand-700 hover:underline">
        Open the full list →
      </Link>
    </h2>
  )
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'Emergency' }]}
        title="Emergency"
        subtitle="Reports and returns that need a person, oldest first. Nothing here happens on its own."
      />
      <div className="space-y-8">
        <section aria-label="Reports">
          {section('Reports', reports.length, '/admin/cases')}
          {reports.length === 0 ? (
            <EmptyState title="No open reports">Customer reports appear here.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {reports.map((c) => (
                <li key={c.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/admin/cases/${c.id}`}
                      className="font-bold underline-offset-2 hover:underline"
                    >
                      {c.case_no} · order {c.order_number}
                    </Link>
                    <span className="flex items-center gap-2 text-sm text-muted">
                      <Badge tone="warning">{c.status.replaceAll('_', ' ')}</Badge>
                      {c.case_type.replaceAll('_', ' ')} · {lagosDateTime(c.created_at)}
                    </span>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Returns">
          {section('Returns waiting for a decision', waitingReturns.length, '/admin/returns')}
          {waitingReturns.length === 0 ? (
            <EmptyState title="No returns waiting">Return requests appear here.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {waitingReturns.map((r) => (
                <li key={r.id}>
                  <Card className="space-y-1">
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href="/admin/returns"
                        className="font-bold underline-offset-2 hover:underline"
                      >
                        {r.order_number}
                      </Link>
                      <span className="text-sm text-muted">{lagosDateTime(r.created_at)}</span>
                    </p>
                    <p className="text-sm">
                      {r.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
                    </p>
                    <p className="text-sm text-muted">{r.reason}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
