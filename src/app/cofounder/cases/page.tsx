import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { lagosDate } from '@/lib/time'
import { portalCases } from '@/server/modules/cofounder/portal'

export const metadata: Metadata = { title: 'Support cases' }
export const dynamic = 'force-dynamic'

const KIND: Record<string, string> = {
  missing_item: 'Missing item',
  wrong_item: 'Wrong item',
  damaged: 'Damaged',
  not_received: 'Not received',
  quality: 'Quality',
  delivery_problem: 'Delivery problem',
  other: 'Other',
}
const STATUS: Record<string, string> = {
  open: 'Open',
  under_review: 'Under review',
  decided: 'Decided',
  closed: 'Closed',
}

export default async function CofounderCases() {
  const rows = await portalCases()
  if (!rows)
    return (
      <EmptyState title="We could not load the cases" icon="alert">
        Please try again.
      </EmptyState>
    )
  return (
    <>
      <PageHeader
        title="Support cases"
        subtitle="To keep an eye on how customers and shops are doing. You see what was reported, not who reported it. Decisions stay with the founder."
      />
      {rows.length === 0 ? (
        <EmptyState title="No cases" icon="check-circle">
          Nothing has been reported.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => (
            <li
              key={c.case_no}
              className="space-y-1 rounded-[var(--radius-control)] border border-line bg-white p-3"
            >
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold text-navy-900">{c.case_no}</span>
                <Badge tone="info">{KIND[c.case_type] ?? c.case_type}</Badge>
                <Badge
                  tone={c.status === 'open' || c.status === 'under_review' ? 'warning' : 'neutral'}
                >
                  {STATUS[c.status] ?? c.status}
                </Badge>
                <span className="text-sm text-muted">{lagosDate(c.created_at)}</span>
              </p>
              <p className="text-sm">{c.description}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
