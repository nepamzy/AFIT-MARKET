import { describe, expect, it } from 'vitest'
import {
  computeBoard,
  dueReminders,
  type CofounderMonth,
  type CofounderSettings,
} from './cofounder'

const settings: CofounderSettings = {
  cofounder_name: 'Emediong Etim',
  signing_date: '2026-12-10',
  graduation_date: '2027-03-31',
  stake_bps: 1000,
  cliff_active_months: 2,
  valuation_multiple: 2,
  floor_per_percent_kobo: 3_000_000,
  bad_leaver_percent: 50,
  school_share_bps: 500,
  default_running_costs_kobo: 12_907_000,
  statement_day: 5,
  payment_day: 15,
  school_payment_day: 7,
}
const naira = (n: number) => n * 100
const m = (month: string, extra: Partial<CofounderMonth> = {}): CofounderMonth => ({
  month,
  active: true,
  running_costs_kobo: null,
  other_deductions_kobo: 0,
  school_share_override_kobo: null,
  cofounder_paid_kobo: null,
  cofounder_paid_on: null,
  school_paid_kobo: null,
  school_paid_on: null,
  note: null,
  ...extra,
})
const months = [m('2026-12-01'), m('2027-01-01'), m('2027-02-01'), m('2027-03-01')]

describe('computeBoard', () => {
  it('is not ready until both dates are set', () => {
    expect(computeBoard({ ...settings, signing_date: null }, [], [], new Date()).ready).toBe(false)
  })

  it('earns nothing before the cliff, then the stake share per active month', () => {
    const afterOne = computeBoard(settings, months, [], new Date('2027-01-05T10:00:00Z'))
    expect(afterOne.completedActive).toBe(1)
    expect(afterOne.vestedBps).toBe(0)
    const afterTwo = computeBoard(settings, months, [], new Date('2027-02-05T10:00:00Z'))
    expect(afterTwo.cliffReached).toBe(true)
    expect(afterTwo.vestedBps).toBe(500) // 2 of 4 months of a 10% stake
    expect(afterTwo.perMonthBps).toBe(250)
  })

  it('does not count breaks as active months', () => {
    const withBreak = [m('2026-12-01', { active: false }), ...months.slice(1)]
    const b = computeBoard(settings, withBreak, [], new Date('2027-04-10T10:00:00Z'))
    expect(b.totalActive).toBe(3)
    expect(b.vestedBps).toBe(1000)
  })

  it("works out the month's profit share like the agreement's example", () => {
    // income 900,000; running costs 129,070; school share 5% of what is left = 38,547 (rounded)
    const inc = [{ month: '2026-12-01', income_kobo: naira(900_000) }]
    const one = [m('2026-12-01')]
    const s2 = { ...settings, graduation_date: '2026-12-31', cliff_active_months: 1 }
    const b = computeBoard(s2, one, inc, new Date('2027-01-06T10:00:00Z'))
    const r = b.rows[0]!
    expect(r.school).toBe(3_854_650)
    expect(r.profit).toBe(naira(900_000) - 12_907_000 - 3_854_650)
    // fully vested here, so the whole 10% share is due
    expect(r.cofounderDue).toBe(Math.floor((r.profit * 1000) / 10_000))
  })

  it('carries a loss forward before paying any share', () => {
    const inc = [
      { month: '2026-12-01', income_kobo: 0 },
      { month: '2027-01-01', income_kobo: naira(500_000) },
    ]
    const b = computeBoard(
      { ...settings, cliff_active_months: 0 },
      months,
      inc,
      new Date('2027-03-10T10:00:00Z'),
    )
    const dec = b.rows[0]!
    const jan = b.rows[1]!
    expect(dec.profit).toBeLessThan(0)
    expect(dec.cofounderDue).toBe(0)
    expect(jan.carryIn).toBe(dec.profit)
    expect(jan.base).toBe(Math.max(0, jan.profit + dec.profit))
  })

  it('never prices the buyback below the floor', () => {
    const b = computeBoard(settings, months, [], new Date('2027-04-10T10:00:00Z'))
    expect(b.buyback).not.toBeNull()
    expect(b.buyback!.floor).toBe(30_000 * 100 * 10) // 10 percent at 30,000 naira each
    expect(b.buyback!.good).toBe(b.buyback!.floor)
    expect(b.buyback!.bad).toBe(Math.round(b.buyback!.good / 2))
  })

  it('lists the payment due and reminds once it is near or late', () => {
    const inc = [{ month: '2027-01-01', income_kobo: naira(2_000_000) }]
    const b = computeBoard(settings, months, inc, new Date('2027-02-13T10:00:00Z'))
    const pay = b.events.find((e) => e.key === 'pay:2027-01')
    expect(pay?.kind).toBe('cofounder')
    const near = dueReminders(b.events, new Date('2027-02-13T10:00:00Z'), (k) => `${k}`)
    expect(near.some((r) => r.key === 'pay:2027-01:3d')).toBe(true)
    const late = dueReminders(b.events, new Date('2027-02-17T10:00:00Z'), (k) => `${k}`)
    expect(late.some((r) => r.key === 'pay:2027-01:late')).toBe(true)
  })

  it('stops listing a payment once it is marked paid', () => {
    const inc = [{ month: '2027-01-01', income_kobo: naira(2_000_000) }]
    const paid = months.map((x) =>
      x.month === '2027-01-01' ? { ...x, cofounder_paid_kobo: 1 } : x,
    )
    const b = computeBoard(settings, paid, inc, new Date('2027-02-13T10:00:00Z'))
    expect(b.events.find((e) => e.key === 'pay:2027-01')).toBeUndefined()
  })
})
