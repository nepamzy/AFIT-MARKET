/**
 * The co-founder's earned stake, monthly profit share and buyback price, worked out from the agreement.
 * Pure: no database, no clock (the caller passes `now`). Amounts are whole kobo.
 *
 *  - Active month: a month the owner marked as "school in session". Each one earns stake / T, after the cliff.
 *  - Distributable profit: commission earned - running costs - the school's share - other deductions.
 *    A loss is carried forward and taken off later months before any share is paid.
 *  - Monthly share: distributable profit (after carried losses) x the stake earned by the end of that month.
 *  - Buyback: valuation multiple x the last 12 months' distributable profit, x the stake earned, never below the floor.
 */

export type CofounderSettings = {
  cofounder_name: string
  signing_date: string | null
  graduation_date: string | null
  stake_bps: number
  cliff_active_months: number
  valuation_multiple: number
  floor_per_percent_kobo: number
  bad_leaver_percent: number
  school_share_bps: number
  default_running_costs_kobo: number
  statement_day: number
  payment_day: number
  school_payment_day: number
}

export type CofounderMonth = {
  month: string
  active: boolean
  running_costs_kobo: number | null
  other_deductions_kobo: number
  school_share_override_kobo: number | null
  cofounder_paid_kobo: number | null
  cofounder_paid_on: string | null
  school_paid_kobo: number | null
  school_paid_on: string | null
  note: string | null
}

export type Income = { month: string; income_kobo: number }

export type Row = {
  month: string
  label: string
  active: boolean
  ended: boolean
  income: number
  costs: number
  school: number
  other: number
  profit: number
  carryIn: number
  base: number
  vestedBps: number
  cofounderDue: number
  cofounderPaid: number | null
  schoolPaid: number | null
  statementAt: Date
  cofounderDueAt: Date
  schoolDueAt: Date
  note: string | null
}

export type CofounderEvent = {
  key: string
  kind: 'statement' | 'cofounder' | 'school' | 'cliff' | 'graduation' | 'buyback'
  label: string
  at: Date
  amount?: number
}

export type Board = {
  ready: boolean
  totalActive: number
  perMonthBps: number
  completedActive: number
  cliffReached: boolean
  cliffAt: Date | null
  vestedBps: number
  rows: Row[]
  owedToCofounder: number
  owedToSchool: number
  paidToCofounder: number
  paidToSchool: number
  buyback: { valuation: number; floor: number; good: number; bad: number; months: number } | null
  graduationAt: Date | null
  events: CofounderEvent[]
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

const ymd = (m: string) => {
  const [y, mo] = m.slice(0, 7).split('-').map(Number)
  return { y: y!, mo: mo! }
}

/** First instant of a month in Lagos (UTC+1, no daylight saving). */
export const monthStart = (m: string): Date => {
  const { y, mo } = ymd(m)
  return new Date(Date.UTC(y, mo - 1, 1) - HOUR)
}
export const monthEnd = (m: string): Date => {
  const { y, mo } = ymd(m)
  return new Date(Date.UTC(y, mo, 1) - HOUR)
}
/** Day `d` of the month after `m`, at 08:00 Lagos. */
const nextMonthDay = (m: string, d: number): Date => {
  const { y, mo } = ymd(m)
  return new Date(Date.UTC(y, mo, d, 7))
}
const isoMonth = (y: number, mo: number) => `${y}-${String(mo).padStart(2, '0')}-01`
const lagosDay = (iso: string): Date => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - HOUR)
export const monthLabel = (m: string) => {
  const { y, mo } = ymd(m)
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function monthsBetween(from: string, to: string): string[] {
  const a = ymd(from)
  const b = ymd(to)
  const out: string[] = []
  let y = a.y
  let mo = a.mo
  while (y < b.y || (y === b.y && mo <= b.mo)) {
    out.push(isoMonth(y, mo))
    mo += 1
    if (mo > 12) {
      mo = 1
      y += 1
    }
  }
  return out
}

const pctOf = (amount: number, bps: number) => Math.round((amount * bps) / 10_000)

export function computeBoard(
  s: CofounderSettings,
  monthRows: CofounderMonth[],
  income: Income[],
  now: Date,
): Board {
  const empty: Board = {
    ready: false,
    totalActive: 0,
    perMonthBps: 0,
    completedActive: 0,
    cliffReached: false,
    cliffAt: null,
    vestedBps: 0,
    rows: [],
    owedToCofounder: 0,
    owedToSchool: 0,
    paidToCofounder: 0,
    paidToSchool: 0,
    buyback: null,
    graduationAt: null,
    events: [],
  }
  if (!s.signing_date || !s.graduation_date) return empty
  const range = monthsBetween(s.signing_date, s.graduation_date)
  const byMonth = new Map(monthRows.map((m) => [m.month.slice(0, 7), m]))
  const incomeBy = new Map(income.map((i) => [i.month.slice(0, 7), Number(i.income_kobo)]))
  const activeOf = (m: string) => byMonth.get(m.slice(0, 7))?.active ?? true
  const totalActive = range.filter(activeOf).length
  if (totalActive === 0) return empty
  const graduationAt = lagosDay(s.graduation_date)
  const graduated = now.getTime() >= graduationAt.getTime() + DAY
  const vestAt = (n: number) =>
    n < s.cliff_active_months
      ? 0
      : Math.min(s.stake_bps, Math.round((s.stake_bps * n) / totalActive))

  const rows: Row[] = []
  let n = 0
  let carry = 0
  let cliffAt: Date | null = null
  for (const m of range) {
    const r = byMonth.get(m.slice(0, 7))
    const active = activeOf(m)
    const end = monthEnd(m)
    const ended = end.getTime() <= now.getTime()
    if (active) n += 1
    const vestedBps = graduated && m === range[range.length - 1] ? s.stake_bps : vestAt(n)
    if (cliffAt === null && active && n === s.cliff_active_months) cliffAt = end
    if (cliffAt === null && s.cliff_active_months === 0) cliffAt = monthStart(range[0]!)
    const inc = incomeBy.get(m.slice(0, 7)) ?? 0
    const costs = r?.running_costs_kobo ?? s.default_running_costs_kobo
    const school =
      r?.school_share_override_kobo ?? pctOf(Math.max(0, inc - costs), s.school_share_bps)
    const other = r?.other_deductions_kobo ?? 0
    const profit = inc - costs - school - other
    const net = profit + carry
    const base = Math.max(0, net)
    const carryIn = carry
    carry = Math.min(0, net)
    rows.push({
      month: m,
      label: monthLabel(m),
      active,
      ended,
      income: inc,
      costs,
      school,
      other,
      profit,
      carryIn,
      base,
      vestedBps,
      cofounderDue: ended ? Math.floor((base * vestedBps) / 10_000) : 0,
      cofounderPaid: r?.cofounder_paid_kobo ?? null,
      schoolPaid: r?.school_paid_kobo ?? null,
      statementAt: nextMonthDay(m, s.statement_day),
      cofounderDueAt: nextMonthDay(m, s.payment_day),
      schoolDueAt: nextMonthDay(m, s.school_payment_day),
      note: r?.note ?? null,
    })
  }

  const shown = rows.filter((r) => monthStart(r.month).getTime() <= now.getTime())
  const completedActive = rows.filter((r) => r.active && r.ended).length
  const cliffReached = completedActive >= s.cliff_active_months
  const lastEnded = [...rows].reverse().find((r) => r.ended)
  const vestedBps = graduated ? s.stake_bps : lastEnded ? lastEnded.vestedBps : 0
  const owedToCofounder = shown.reduce(
    (a, r) => a + Math.max(0, r.cofounderDue - (r.cofounderPaid ?? 0)),
    0,
  )
  const owedToSchool = shown.reduce(
    (a, r) => a + (r.ended ? Math.max(0, r.school - (r.schoolPaid ?? 0)) : 0),
    0,
  )

  // buyback estimate, as if the Valuation Date were today (or graduation, once that has passed)
  const valRows = rows.filter((r) => r.ended).slice(-12)
  let buyback: Board['buyback'] = null
  if (valRows.length > 0) {
    const sum = valRows.reduce((a, r) => a + r.profit, 0)
    const annual = valRows.length >= 12 ? sum : Math.round((sum / valRows.length) * 12)
    const valuation = Math.max(0, Math.round(annual * s.valuation_multiple))
    const pct = vestedBps / 100
    const floor = Math.round(s.floor_per_percent_kobo * pct)
    const good = Math.max(floor, Math.round((valuation * vestedBps) / 10_000))
    buyback = {
      valuation,
      floor,
      good,
      bad: Math.round((good * s.bad_leaver_percent) / 100),
      months: valRows.length,
    }
  }

  // things coming up (and things overdue), for the timers and the reminders
  const events: CofounderEvent[] = []
  for (const r of rows) {
    if (!r.ended && monthStart(r.month).getTime() > now.getTime()) continue
    if (r.ended) {
      events.push({
        key: `stmt:${r.month.slice(0, 7)}`,
        kind: 'statement',
        label: `Send ${s.cofounder_name} the ${r.label} statement`,
        at: r.statementAt,
      })
      if (r.cofounderDue > 0 && r.cofounderPaid === null)
        events.push({
          key: `pay:${r.month.slice(0, 7)}`,
          kind: 'cofounder',
          label: `Pay ${s.cofounder_name} for ${r.label}`,
          at: r.cofounderDueAt,
          amount: r.cofounderDue,
        })
      if (r.school > 0 && r.schoolPaid === null)
        events.push({
          key: `sch:${r.month.slice(0, 7)}`,
          kind: 'school',
          label: `Pay AFIT its share for ${r.label}`,
          at: r.schoolDueAt,
          amount: r.school,
        })
    }
  }
  // the current month will also need these once it ends
  const current = rows.find((r) => !r.ended && monthStart(r.month).getTime() <= now.getTime())
  if (current)
    events.push({
      key: `stmt:${current.month.slice(0, 7)}`,
      kind: 'statement',
      label: `Send ${s.cofounder_name} the ${current.label} statement`,
      at: current.statementAt,
    })
  if (cliffAt && cliffAt.getTime() > now.getTime())
    events.push({
      key: 'cliff',
      kind: 'cliff',
      label: `${s.cofounder_name}'s cliff ends and the first stake vests`,
      at: cliffAt,
    })
  if (graduationAt.getTime() + DAY > now.getTime())
    events.push({
      key: 'graduation',
      kind: 'graduation',
      label: 'Graduation: the whole stake vests',
      at: new Date(graduationAt.getTime() + DAY),
    })
  events.push({
    key: 'buyback',
    kind: 'buyback',
    label: `Start the buyback (notice within 60 days of graduation)`,
    at: new Date(graduationAt.getTime() + 60 * DAY),
  })
  events.sort((a, b) => a.at.getTime() - b.at.getTime())

  return {
    ready: true,
    totalActive,
    perMonthBps: Math.round(s.stake_bps / totalActive),
    completedActive,
    cliffReached,
    cliffAt,
    vestedBps,
    rows: shown,
    owedToCofounder,
    owedToSchool,
    paidToCofounder: rows.reduce((a, r) => a + (r.cofounderPaid ?? 0), 0),
    paidToSchool: rows.reduce((a, r) => a + (r.schoolPaid ?? 0), 0),
    buyback,
    graduationAt,
    events,
  }
}

export type Reminder = { key: string; title: string; body: string }

/**
 * Reminders that are due right now: 3 days before, on the day, and (once) when overdue.
 * Each has a fixed key, so asking again never repeats a reminder.
 */
export function dueReminders(
  events: CofounderEvent[],
  now: Date,
  fmt: (kobo: number) => string,
): Reminder[] {
  const out: Reminder[] = []
  for (const e of events) {
    if (
      e.kind === 'buyback' ||
      e.kind === 'graduation' ||
      e.kind === 'cliff' ||
      e.kind === 'statement' ||
      e.kind === 'cofounder' ||
      e.kind === 'school'
    ) {
      const left = e.at.getTime() - now.getTime()
      const money = e.amount ? ` (${fmt(e.amount)})` : ''
      if (left < 0 && left > -14 * DAY)
        out.push({ key: `${e.key}:late`, title: 'Overdue', body: `${e.label}${money} is overdue.` })
      else if (left >= 0 && left <= DAY)
        out.push({
          key: `${e.key}:today`,
          title: 'Due today',
          body: `${e.label}${money} is due today.`,
        })
      else if (left > DAY && left <= 3 * DAY)
        out.push({
          key: `${e.key}:3d`,
          title: 'Due in 3 days',
          body: `${e.label}${money} is due in 3 days.`,
        })
    }
  }
  return out
}
