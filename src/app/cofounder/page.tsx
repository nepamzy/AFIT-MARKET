import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, PageHeader } from '@/components/ui/card'
import { MetricCard, MetricGrid } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/states'
import { computeBoard } from '@/lib/cofounder'
import { portalOverview, portalStatement } from '@/server/modules/cofounder/portal'

export const metadata: Metadata = { title: 'Co-founder' }
export const dynamic = 'force-dynamic'

export default async function CofounderHome() {
  const [o, st] = await Promise.all([portalOverview(), portalStatement()])
  if (!o)
    return (
      <EmptyState title="We could not load this page" icon="alert">
        Please try again.
      </EmptyState>
    )
  const board = st ? computeBoard(st.settings, st.months, st.income, new Date()) : null
  return (
    <>
      <PageHeader
        title="Co-founder"
        subtitle="Your side of AFIT Market: shops to review, the pipeline and your own statement."
      />
      <MetricGrid>
        <MetricCard
          label="Shops waiting for review"
          value={o.applications_waiting}
          note="Open the list to approve"
          icon="file"
          accent="gold"
          href="/cofounder/applications"
        />
        <MetricCard
          label="Approved by you"
          value={o.approved_by_me}
          note="Your name is on each one"
          icon="check-circle"
          accent="success"
        />
        <MetricCard label="Shops live" value={o.shops_live} icon="store" />
        <MetricCard
          label="Invitation links"
          value={`${o.invites_used} used`}
          note={`${o.invites_unused} still waiting to be used`}
          icon="mail"
        />
        <MetricCard label="Orders, last 7 days" value={o.orders_7d} icon="package" />
        <MetricCard label="Open support cases" value={o.cases_open} icon="help" />
      </MetricGrid>
      {board?.ready && (
        <Card className="mt-6 space-y-1">
          <h2 className="text-lg font-extrabold text-navy-900">Your stake</h2>
          <p>
            Earned so far:{' '}
            <strong>{(board.vestedBps / 100).toFixed(board.vestedBps % 100 === 0 ? 0 : 2)}%</strong>{' '}
            of {(st!.settings.stake_bps / 100).toFixed(0)}% ({board.completedActive} of{' '}
            {board.totalActive} active months done).
          </p>
          <p>
            <Link href="/cofounder/statement" className="font-bold text-brand-700 underline">
              See your monthly statement
            </Link>
          </p>
        </Card>
      )}
    </>
  )
}
