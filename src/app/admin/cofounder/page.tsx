import type { Metadata } from 'next'
import { ActionForm } from '@/components/forms/action-form'
import { Countdown } from '@/components/domain/countdown'
import { Badge } from '@/components/ui/badge'
import { Card, PageHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/fields'
import { MetricCard, MetricGrid } from '@/components/ui/metric-card'
import { Section } from '@/components/ui/section'
import { EmptyState } from '@/components/ui/states'
import { computeBoard } from '@/lib/cofounder'
import { formatNaira } from '@/lib/money'
import { lagosDate } from '@/lib/time'
import {
  markCofounderPaidAction,
  saveCofounderMonthAction,
  saveCofounderSettingsAction,
} from '@/server/modules/cofounder/actions'
import { cofounderData } from '@/server/modules/cofounder/queries'

export const metadata: Metadata = { title: 'Co-founder analytics' }
export const dynamic = 'force-dynamic'

const naira = (kobo: number) => String(Math.round(kobo) / 100)
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`
const EVENT_TONE = { statement: 'brand', cofounder: 'warning', school: 'warning' } as const

export default async function CofounderAnalytics() {
  const data = await cofounderData()
  if (!data)
    return (
      <EmptyState title="We could not load this board" icon="alert">
        Please try again.
      </EmptyState>
    )
  const s = data.settings
  const now = new Date()
  const b = computeBoard(s, data.months, data.income, now)
  const first = s.signing_date?.slice(0, 10) ?? ''
  const today = new Date(now.getTime() + 3_600_000).toISOString().slice(0, 10)
  return (
    <>
      <PageHeader
        title="Co-founder analytics"
        subtitle={`Works out what to pay ${s.cofounder_name} and what AFIT is owed, month by month. Only you can see this page.`}
        breadcrumbs={[
          { label: 'Administration', href: '/admin' },
          { label: 'Co-founder analytics' },
        ]}
      />

      {b.ready && (
        <>
          <MetricGrid>
            <MetricCard
              label="Stake earned so far"
              value={pct(b.vestedBps)}
              note={`of ${pct(s.stake_bps)}. ${b.completedActive} of ${b.totalActive} active months done${b.cliffReached ? '' : ' (still before the cliff)'}`}
              icon="chart"
            />
            <MetricCard
              label={`To pay ${s.cofounder_name}`}
              value={formatNaira(b.owedToCofounder)}
              note={`${formatNaira(b.paidToCofounder)} paid so far`}
              icon="coins"
              accent="gold"
            />
            <MetricCard
              label="To pay AFIT (the school)"
              value={formatNaira(b.owedToSchool)}
              note={`${formatNaira(b.paidToSchool)} paid so far`}
              icon="coins"
              accent="success"
            />
            <MetricCard
              label="Buyback price today"
              value={b.buyback ? formatNaira(b.buyback.good) : '–'}
              note={
                b.buyback
                  ? `Bad leaver: ${formatNaira(b.buyback.bad)}. Floor ${formatNaira(b.buyback.floor)}`
                  : 'Shown after the first month ends'
              }
              icon="clock"
            />
          </MetricGrid>

          <Section
            title="Timers"
            description="What is due next, counting down live. You also get an alert 3 days before, on the day, and when something is overdue."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {b.events.slice(0, 6).map((e) => (
                <Card key={e.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-navy-900">{e.label}</p>
                    {(e.kind === 'statement' || e.kind === 'cofounder' || e.kind === 'school') && (
                      <Badge tone={EVENT_TONE[e.kind]}>
                        {e.kind === 'statement' ? 'Statement' : 'Payment'}
                      </Badge>
                    )}
                  </div>
                  {e.amount ? (
                    <p className="text-lg font-extrabold">{formatNaira(e.amount)}</p>
                  ) : null}
                  <p className="text-sm text-muted">{lagosDate(e.at)}</p>
                  <p>
                    <Countdown at={e.at.toISOString()} />
                  </p>
                </Card>
              ))}
            </div>
          </Section>

          <Section
            title="Month by month"
            description="Commission earned comes from completed orders automatically. Change a month's costs or mark a payment below."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="py-2 pr-3">Month</th>
                    <th className="py-2 pr-3">Income</th>
                    <th className="py-2 pr-3">Running costs</th>
                    <th className="py-2 pr-3">AFIT share</th>
                    <th className="py-2 pr-3">Left</th>
                    <th className="py-2 pr-3">Stake</th>
                    <th className="py-2 pr-3">To {s.cofounder_name}</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...b.rows].reverse().map((r) => (
                    <tr key={r.month} className="border-b border-line/60 align-top">
                      <td className="py-2 pr-3 font-bold">
                        {r.label}
                        {!r.active && (
                          <span className="block text-xs font-normal text-muted">break</span>
                        )}
                        {!r.ended && (
                          <span className="block text-xs font-normal text-muted">
                            this month, so far
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{formatNaira(r.income)}</td>
                      <td className="py-2 pr-3">{formatNaira(r.costs)}</td>
                      <td className="py-2 pr-3">{formatNaira(r.school)}</td>
                      <td className="py-2 pr-3">
                        {formatNaira(r.profit)}
                        {r.carryIn < 0 && (
                          <span className="block text-xs text-muted">
                            after {formatNaira(-r.carryIn)} carried loss
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{pct(r.vestedBps)}</td>
                      <td className="py-2 pr-3 font-bold">
                        {r.ended ? formatNaira(r.cofounderDue) : '–'}
                      </td>
                      <td className="py-2">
                        {r.cofounderPaid !== null ? (
                          <Badge tone="success">Paid {formatNaira(r.cofounderPaid)}</Badge>
                        ) : r.ended && r.cofounderDue > 0 ? (
                          <Badge tone="warning">Owed</Badge>
                        ) : (
                          <span className="text-muted">–</span>
                        )}
                        {r.ended && r.school > 0 && (
                          <span className="mt-1 block">
                            {r.schoolPaid !== null ? (
                              <Badge tone="success">AFIT paid</Badge>
                            ) : (
                              <Badge tone="warning">AFIT owed</Badge>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Record a payment"
            description="After you pay, record it so the timer stops and the reminders stop."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {(['cofounder', 'school'] as const).map((who) => (
                <Card key={who} className="space-y-3">
                  <h3 className="font-extrabold text-navy-900">
                    {who === 'cofounder'
                      ? `I paid ${s.cofounder_name}`
                      : 'I paid AFIT (the school)'}
                  </h3>
                  <ActionForm
                    action={markCofounderPaidAction}
                    submitLabel="Record payment"
                    pendingLabel="Saving…"
                  >
                    <input type="hidden" name="who" value={who} />
                    <label className="block">
                      <span className="mb-1 block font-medium">Month</span>
                      <select
                        name="month"
                        className="w-full rounded-[var(--radius-control)] border border-line bg-white px-3 py-2"
                        required
                      >
                        {b.rows
                          .filter((r) => r.ended)
                          .reverse()
                          .map((r) => (
                            <option key={r.month} value={r.month}>
                              {r.label} (
                              {formatNaira(who === 'cofounder' ? r.cofounderDue : r.school)} due)
                            </option>
                          ))}
                      </select>
                    </label>
                    <Input label="Amount paid (naira)" name="amount" inputMode="decimal" required />
                    <Input
                      label="Date paid"
                      name="paid_on"
                      type="date"
                      defaultValue={today}
                      required
                    />
                  </ActionForm>
                </Card>
              ))}
            </div>
          </Section>

          {b.buyback && (
            <Section
              title="Buyback estimate"
              description={`As if the buyback were today. Valuation is ${s.valuation_multiple} times the last ${b.buyback.months} month(s) of what is left, worked up to a year.`}
            >
              <MetricGrid>
                <MetricCard
                  label="Valuation"
                  value={formatNaira(b.buyback.valuation)}
                  icon="chart"
                />
                <MetricCard
                  label="Floor"
                  value={formatNaira(b.buyback.floor)}
                  note="Never less than this"
                  icon="shield"
                />
                <MetricCard
                  label="Good leaver or graduation"
                  value={formatNaira(b.buyback.good)}
                  icon="check-circle"
                  accent="success"
                />
                <MetricCard
                  label={`Bad leaver (${s.bad_leaver_percent}%)`}
                  value={formatNaira(b.buyback.bad)}
                  icon="alert"
                  accent="danger"
                />
              </MetricGrid>
            </Section>
          )}

          <Section
            title="Edit a month"
            description="Use this when a month has costs that are not the usual, or a break month."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {[...b.rows]
                .reverse()
                .slice(0, 6)
                .map((r) => (
                  <Card key={r.month} className="space-y-2">
                    <h3 className="font-extrabold text-navy-900">{r.label}</h3>
                    <ActionForm
                      action={saveCofounderMonthAction}
                      submitLabel="Save month"
                      pendingLabel="Saving…"
                    >
                      <input type="hidden" name="month" value={r.month} />
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name="active" defaultChecked={r.active} /> School in
                        session (counts toward vesting)
                      </label>
                      <Input
                        label="Running costs (naira)"
                        name="running_costs"
                        inputMode="decimal"
                        defaultValue={naira(r.costs)}
                      />
                      <Input
                        label="Refunds and losses (naira)"
                        name="other_deductions"
                        inputMode="decimal"
                        defaultValue={naira(r.other)}
                      />
                      <Input
                        label="AFIT share, if different from the usual (naira)"
                        name="school_override"
                        inputMode="decimal"
                        defaultValue=""
                      />
                      <Input label="Note" name="note" maxLength={200} defaultValue={r.note ?? ''} />
                    </ActionForm>
                  </Card>
                ))}
            </div>
          </Section>
        </>
      )}

      <Section
        title="Agreement settings"
        description="These come from the co-founder agreement. Saving the dates fills in the months between them."
      >
        <Card>
          <ActionForm
            action={saveCofounderSettingsAction}
            submitLabel="Save settings"
            pendingLabel="Saving…"
            variant="gold"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Co-founder's name"
                name="cofounder_name"
                defaultValue={s.cofounder_name}
                required
              />
              <Input
                label="Stake (percent)"
                name="stake_percent"
                inputMode="decimal"
                defaultValue={String(s.stake_bps / 100)}
                required
              />
              <Input
                label="Signing date"
                name="signing_date"
                type="date"
                defaultValue={first}
                required
              />
              <Input
                label="Graduation date"
                name="graduation_date"
                type="date"
                defaultValue={s.graduation_date?.slice(0, 10) ?? ''}
                required
              />
              <Input
                label="Cliff (active months)"
                name="cliff_active_months"
                inputMode="numeric"
                defaultValue={String(s.cliff_active_months)}
                required
              />
              <Input
                label="Valuation multiple (times a year's profit)"
                name="valuation_multiple"
                inputMode="decimal"
                defaultValue={String(s.valuation_multiple)}
                required
              />
              <Input
                label="Floor price for each 1% of stake (naira)"
                name="floor_per_percent"
                inputMode="decimal"
                defaultValue={naira(s.floor_per_percent_kobo)}
                required
              />
              <Input
                label="Bad leaver gets this percent of the price"
                name="bad_leaver_percent"
                inputMode="numeric"
                defaultValue={String(s.bad_leaver_percent)}
                required
              />
              <Input
                label="AFIT's share of what is left (percent)"
                name="school_share_percent"
                inputMode="decimal"
                defaultValue={String(s.school_share_bps / 100)}
                required
              />
              <Input
                label="Usual running costs each month (naira)"
                name="default_running_costs"
                inputMode="decimal"
                defaultValue={naira(s.default_running_costs_kobo)}
                required
              />
              <Input
                label="Statement due on day (of next month)"
                name="statement_day"
                inputMode="numeric"
                defaultValue={String(s.statement_day)}
                required
              />
              <Input
                label="Co-founder payment due on day"
                name="payment_day"
                inputMode="numeric"
                defaultValue={String(s.payment_day)}
                required
              />
              <Input
                label="AFIT payment due on day"
                name="school_payment_day"
                inputMode="numeric"
                defaultValue={String(s.school_payment_day)}
                required
              />
            </div>
          </ActionForm>
        </Card>
      </Section>
    </>
  )
}
