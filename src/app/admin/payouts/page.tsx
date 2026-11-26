import { lagosDateTime } from '@/lib/time'
import type { Metadata } from 'next'
import { Badge, type Tone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { MetricCard, MetricGrid } from '@/components/ui/metric-card'
import { Money } from '@/components/ui/money'
import { EmptyState } from '@/components/ui/states'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { retryPayoutAction } from '@/server/modules/payouts/actions'

export const metadata: Metadata = { title: 'Splits' }

type Row = {
  id: string
  vendor_name: string
  order_number: string
  status: string
  amount_kobo: number | null
  eligible_at: string
  attempts: number
  last_error: string | null
  paid_at: string | null
}
type Payouts = { counts: Record<string, number>; paid_kobo: number; rows: Row[] }

const STATUS: Record<string, [string, Tone]> = {
  scheduled: ['Waiting for the report window to close (midnight)', 'info'],
  held: ['On hold: complaint or refund open', 'warning'],
  processing: ['Sent to Paystack', 'brand'],
  paid: [
    'Split to the shop (reaches its bank on Paystack’s settlement day, usually the next working day)',
    'success',
  ],
  failed: ['Not split, will retry', 'danger'],
  skipped: ['Nothing to pay', 'neutral'],
}

export default async function Payouts() {
  const sb = await createSupabaseServerClient()
  const { data } = await sb.rpc('admin_list_payouts', { p_status: null, p_limit: 100 })
  const p = data as Payouts | null
  if (!p) return <EmptyState title="Unavailable">Splits could not be loaded.</EmptyState>
  const n = (k: string) => p.counts[k] ?? 0
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'Splits' }]}
        title="Splits"
        subtitle="When a customer pays, Paystack splits the payment: the shop’s share goes straight to its bank account and AFIT Market keeps its commission. You do not need to do anything here unless a split fails."
      />
      <MetricGrid>
        <MetricCard
          label="Split to shops"
          value={<Money kobo={p.paid_kobo} />}
          icon="coins"
          accent="success"
        />
        <MetricCard label="Waiting" value={n('scheduled') + n('processing')} icon="clock" />
        <MetricCard label="On hold" value={n('held')} icon="alert" accent="gold" />
        <MetricCard label="Not split" value={n('failed')} icon="alert" accent="danger" />
      </MetricGrid>
      <Card className="mt-4 space-y-1">
        <p className="text-sm text-muted">
          A split that did not go through is tried again by itself (up to 5 times). If one keeps
          failing, check that the shop has a verified bank account and that its Paystack sub-account
          is verified, then press Try again.
        </p>
      </Card>
      <div className="mt-4">
        <DataTable
          caption="Latest splits"
          rows={p.rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState title="No splits yet">
              A split is recorded when an order is completed.
            </EmptyState>
          }
          columns={[
            { header: 'Shop', cell: (r) => <span className="font-semibold">{r.vendor_name}</span> },
            { header: 'Order', cell: (r) => r.order_number },
            {
              header: 'Amount',
              align: 'right',
              cell: (r) =>
                r.amount_kobo === null ? (
                  <span className="text-muted">Worked out when paid</span>
                ) : (
                  <Money kobo={r.amount_kobo} />
                ),
            },
            {
              header: 'Status',
              cell: (r) => {
                const [label, tone] = STATUS[r.status] ?? [r.status, 'neutral' as Tone]
                return (
                  <span className="space-y-1">
                    <Badge tone={tone}>{label}</Badge>
                    {r.last_error && (
                      <span className="block text-xs text-muted">{r.last_error}</span>
                    )}
                  </span>
                )
              },
            },
            {
              header: 'Due',
              cell: (r) =>
                r.paid_at ? `Paid ${lagosDateTime(r.paid_at)}` : lagosDateTime(r.eligible_at),
            },
            {
              header: '',
              cell: (r) =>
                r.status === 'failed' || r.status === 'held' ? (
                  <form action={retryPayoutAction}>
                    <input type="hidden" name="payoutId" value={r.id} />
                    <Button type="submit" variant="secondary">
                      Try again
                    </Button>
                  </form>
                ) : null,
            },
          ]}
        />
      </div>
    </>
  )
}
