import { afterAll, describe, expect, it } from 'vitest'
import { AAL2, createUser, pool, withTx } from './helpers'
import {
  accept,
  callFails,
  callJson,
  deliveryOrder,
  mkRider,
  orderStatus,
  rider,
} from './rider-helpers'

afterAll(async () => {
  await pool.end()
})

const issue = (c: Parameters<typeof callJson>[0], owner: string, order: string) =>
  callJson(c, AAL2(owner), `select public.vendor_issue_pickup_token($1) r`, [order]) as Promise<{
    token: string
    expires_at: string
  }>
const scan = (c: Parameters<typeof callJson>[0], who: string, token: string) =>
  callJson(c, rider(who), `select public.rider_confirm_pickup($1) r`, [token]) as Promise<{
    ok: boolean
    reason?: string
  }>

describe('shop shows a one-time code, the assigned rider scans it', () => {
  it('only the assigned rider can complete the hand-over, once, with the right code', async () => {
    await withTx(async (c) => {
      const o = await deliveryOrder(c)
      const r = await mkRider(c)
      const other = await mkRider(c)
      await accept(c, r.id, o.order)
      expect(await orderStatus(c, o.order)).toBe('RIDER_ASSIGNED')
      const t = await issue(c, o.owner, o.order)
      expect(t.token).toMatch(/^[0-9A-F]{10}$/)
      // another rider, or a wrong code, gets nothing
      expect(await scan(c, other.id, t.token)).toEqual({ ok: false, reason: 'wrong_code' })
      expect(await scan(c, r.id, 'WRONGCODE1')).toEqual({ ok: false, reason: 'wrong_code' })
      expect(await orderStatus(c, o.order)).toBe('RIDER_ASSIGNED')
      // the right rider with the right code (typed in lower case) completes it
      expect(await scan(c, r.id, t.token.toLowerCase())).toMatchObject({ ok: true })
      expect(await orderStatus(c, o.order)).toBe('PICKED_UP_BY_RIDER')
      expect(
        (
          await c.query(`select status from public.delivery_assignments where order_id=$1`, [
            o.order,
          ])
        ).rows[0].status,
      ).toBe('picked_up')
      // once only
      expect(await scan(c, r.id, t.token)).toEqual({ ok: false, reason: 'wrong_code' })
    })
  })

  it('a new code cancels the old one; an expired code is refused', async () => {
    await withTx(async (c) => {
      const o = await deliveryOrder(c)
      const r = await mkRider(c)
      await accept(c, r.id, o.order)
      const first = await issue(c, o.owner, o.order)
      const second = await issue(c, o.owner, o.order)
      expect(await scan(c, r.id, first.token)).toEqual({ ok: false, reason: 'wrong_code' })
      await c.query(
        `update public.assignment_tokens set expires_at = now() - interval '1 minute' where used_at is null and invalidated_at is null`,
      )
      expect(await scan(c, r.id, second.token)).toEqual({ ok: false, reason: 'code_expired' })
      expect(await orderStatus(c, o.order)).toBe('RIDER_ASSIGNED')
    })
  })

  it('only the shop that owns the order can show a code, and only while a rider is waiting; customers cannot', async () => {
    await withTx(async (c) => {
      const o = await deliveryOrder(c)
      const stranger = await createUser(c, 'str3')
      expect(
        (
          await callFails(c, AAL2(o.owner), `select public.vendor_issue_pickup_token($1)`, [
            o.order,
          ])
        ).message,
      ).toMatch(/no_pending_pickup/)
      const r = await mkRider(c)
      await accept(c, r.id, o.order)
      expect(
        (
          await callFails(c, AAL2(stranger), `select public.vendor_issue_pickup_token($1)`, [
            o.order,
          ])
        ).code,
      ).toBe('42501')
      expect(
        (await callFails(c, AAL2(o.cust), `select public.vendor_issue_pickup_token($1)`, [o.order]))
          .code,
      ).toBe('42501')
      expect(
        (await callFails(c, AAL2(stranger), `select public.rider_confirm_pickup('ABCDEF1234')`))
          .code,
      ).toBe('42501') // not a rider
    })
  })
})
