import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { computeBoard } from '@/lib/cofounder'
import { formatNaira } from '@/lib/money'
import { portalStatement } from '@/server/modules/cofounder/portal'

export const metadata: Metadata = { title: 'My statement' }
export const dynamic = 'force-dynamic'

export default async function Statement() {
  const st = await portalStatement()
  if (!st)
    return (
      <EmptyState title="We could not load your statement" icon="alert">
        Please try again.
      </EmptyState>
    )
  const b = computeBoard(st.settings, st.months, st.income, new Date())
  if (!b.ready)
    return (
      <EmptyState title="Your statement starts soon" icon="clock">
        It appears once the dates in your agreement are entered.
      </EmptyState>
    )
  return (
    <>
      <PageHeader
        title="My statement"
        subtitle={`Month by month: what AFIT Market earned, what it cost, what is left, and your share. You have earned ${(b.vestedBps / 100).toFixed(b.vestedBps % 100 === 0 ? 0 : 2)}% so far.`}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="py-2 pr-3">Month</th>
              <th className="py-2 pr-3">Income</th>
              <th className="py-2 pr-3">Running costs</th>
              <th className="py-2 pr-3">AFIT share</th>
              <th className="py-2 pr-3">Left</th>
              <th className="py-2 pr-3">Your stake</th>
              <th className="py-2 pr-3">Your share</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {[...b.rows].reverse().map((r) => (
              <tr key={r.month} className="border-b border-line/60">
                <td className="py-2 pr-3 font-bold">{r.label}</td>
                <td className="py-2 pr-3">{formatNaira(r.income)}</td>
                <td className="py-2 pr-3">{formatNaira(r.costs)}</td>
                <td className="py-2 pr-3">{formatNaira(r.school)}</td>
                <td className="py-2 pr-3">{formatNaira(r.profit)}</td>
                <td className="py-2 pr-3">{(r.vestedBps / 100).toFixed(2)}%</td>
                <td className="py-2 pr-3 font-bold">
                  {r.ended ? formatNaira(r.cofounderDue) : '–'}
                </td>
                <td className="py-2">
                  {r.cofounderPaid !== null ? (
                    <Badge tone="success">Paid</Badge>
                  ) : r.ended && r.cofounderDue > 0 ? (
                    <Badge tone="warning">Due</Badge>
                  ) : (
                    <span className="text-muted">{r.ended ? '–' : 'This month'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
