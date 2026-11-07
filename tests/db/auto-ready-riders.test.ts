import { afterAll, describe, expect, it } from 'vitest'
import { AAL2, as, createUser, failure, pool, withTx } from './helpers'
import { paidOrder } from './refund-helpers'
import {
  accept,
  callFails,
  callJson,
  deliveryOrder,
  mkRider,
  mkShop,
  orderStatus,
  rider,
  vendorAct,
} from './rider-helpers'
import type { PoolClient } from 'pg'

afterAll(async () => {
  await pool.end()
})

/** Moves the moment the order was paid into the past, as if `minutes` had gone by. */
const agePaid = async (c: PoolClient, order: string, minutes: number) => {
  // the history is append-only; inside this rolled-back test transaction the guard is switched off to move time
  await c.query(
    `alter table public.order_status_history disable trigger order_status_history_append_only`,
  )
  await c.query(
    `update public.order_status_history set created_at = now() - make_interval(mins => $2) where order_id = $1 and to_status = 'PAID'`,
    [order, minutes],
  )
  await c.query(
    `alter table public.order_status_history enable trigger order_status_history_append_only`,
  )
}
const setAuto = (c: PoolClient, vendor: string, minutes: number | null) =>
  c.query(
    `update public.vendors set auto_ready_enabled = $2, auto_ready_minutes = $3 where id = $1`,
    [vendor, minutes !== null, minutes],
  )
const run = async (c: PoolClient) =>
  (await c.query(`select public.auto_ready_run() n`)).rows[0].n as number

describe('automatic ready', () => {
  it('a shop that turned it on gets "ready" by itself once the chosen time since payment has passed, not before', async () => {
    await withTx(async (c) => {
      const o = await paidOrder(c, { status: 'PAID' })
      await setAuto(c, o.vendor, 60)
      await vendorAct(c, AAL2(o.owner), o.order, 'accept')
      await agePaid(c, o.order, 30)
      await run(c)
      expect(await orderStatus(c, o.order)).toBe('PREPARING')
      await agePaid(c, o.order, 61)
      await run(c)
      expect(await orderStatus(c, o.order)).toBe('PICKUP_AWAITING_HANDOVER')
      const why = (
        await c.query(
          `select reason from public.order_status_history where order_id=$1 and to_status='READY'`,
          [o.order],
        )
      ).rows[0].reason
      expect(why).toBe('auto_ready')
      expect(
        (
          await c.query(`select count(*)::int n from public.pickup_codes where order_id=$1`, [
            o.order,
          ])
        ).rows[0].n,
      ).toBe(1)
    })
  })
  it('does nothing for a shop that did not turn it on, or for an order nobody accepted; a delivery order goes on offer', async () => {
    await withTx(async (c) => {
      const off = await paidOrder(c, { status: 'PAID' })
      await vendorAct(c, AAL2(off.owner), off.order, 'accept')
      await agePaid(c, off.order, 999)
      const unanswered = await paidOrder(c, { status: 'PAID' })
      await setAuto(c, unanswered.vendor, 30)
      await agePaid(c, unanswered.order, 999)
      await run(c)
      expect(await orderStatus(c, off.order)).toBe('PREPARING')
      expect(await orderStatus(c, unanswered.order)).toBe('PAID')
      const d = await deliveryOrder(c, { ready: false })
      await setAuto(c, d.vendor, 30)
      await vendorAct(c, AAL2(d.owner), d.order, 'accept')
      await agePaid(c, d.order, 31)
      await run(c)
      expect(await orderStatus(c, d.order)).toBe('AWAITING_RIDER')
    })
  })
  it('only a shop owner can change the setting, with one of the allowed times; browsers cannot run the timers', async () => {
    await withTx(async (c) => {
      const o = await paidOrder(c, { status: 'PAID' })
      await as(c, AAL2(o.owner), () =>
        c.query(`select public.vendor_set_auto_ready($1, true, 120)`, [o.vendor]),
      )
      expect(
        (
          await c.query(
            `select auto_ready_enabled e, auto_ready_minutes m from public.vendors where id=$1`,
            [o.vendor],
          )
        ).rows[0],
      ).toEqual({ e: true, m: 120 })
      expect(
        (
          await callFails(c, AAL2(o.owner), `select public.vendor_set_auto_ready($1, true, 45)`, [
            o.vendor,
          ])
        ).message,
      ).toMatch(/invalid_minutes/)
      const stranger = await createUser(c, 'str')
      expect(
        (
          await callFails(c, AAL2(stranger), `select public.vendor_set_auto_ready($1, true, 60)`, [
            o.vendor,
          ])
        ).code,
      ).toBe('42501')
      for (const sql of [
        `select public.auto_ready_run()`,
        `select public.auto_decline_unanswered()`,
      ])
        expect((await callFails(c, AAL2(o.owner), sql)).code).toBe('42501')
    })
  })
  it('a newly approved shop takes the choice made on its application', async () => {
    await withTx(async (c) => {
      const u = await createUser(c, 'newshop')
      await c.query(
        `update public.vendor_applications set auto_ready_enabled = false where applicant_id=$1`,
        [u],
      )
      await c.query(
        `insert into public.vendor_applications (applicant_id, business_name, contact_phone, category_id, description, pickup_location_text, terms_accepted_at, auto_ready_enabled, auto_ready_minutes)
        values ($1,'Auto Kitchen','08030000000',(select id from public.categories limit 1),'A shop that sells food to students.','Gate 2',now(),true,90)`,
        [u],
      )
      const v = (
        await c.query(
          `insert into public.vendors (name, slug, status, category_id, owner_id) values ('Auto Kitchen','auto-kitchen-${Date.now()}','approved',(select id from public.categories limit 1),$1) returning auto_ready_enabled e, auto_ready_minutes m`,
          [u],
        )
      ).rows[0]
      expect(v).toEqual({ e: true, m: 90 })
    })
  })
})

describe('paid orders the shop never answers', () => {
  it('are declined after the allowed hours (15 by default), stock returns, and the automatic refund can start without a shop user', async () => {
    await withTx(async (c) => {
      const o = await paidOrder(c, { status: 'PAID' })
      await agePaid(c, o.order, 14 * 60)
      expect(
        (await c.query(`select public.auto_decline_unanswered() n`)).rows[0].n,
      ).toBeGreaterThanOrEqual(0)
      expect(await orderStatus(c, o.order)).toBe('PAID')
      await agePaid(c, o.order, 15 * 60 + 5)
      await c.query(`select public.auto_decline_unanswered()`)
      expect(await orderStatus(c, o.order)).toBe('CANCELLED')
      const why = (
        await c.query(
          `select reason, actor_id from public.order_status_history where order_id=$1 and to_status='CANCELLED'`,
          [o.order],
        )
      ).rows[0]
      expect(why.reason).toBe('vendor_rejected: The shop did not answer in time')
      expect(why.actor_id).toBeNull()
      const r = (await c.query(`select public.refund_auto_start($1,'paystack_test') r`, [o.order]))
        .rows[0].r
      expect(r).toMatchObject({ status: 'processing', amount_kobo: o.received })
    })
  })
  it('an accepted order is never declined by the timer', async () => {
    await withTx(async (c) => {
      const o = await paidOrder(c, { status: 'PAID' })
      await vendorAct(c, AAL2(o.owner), o.order, 'accept')
      await agePaid(c, o.order, 24 * 60)
      await c.query(`select public.auto_decline_unanswered()`)
      expect(await orderStatus(c, o.order)).toBe('PREPARING')
    })
  })
})

describe("a shop's own riders", () => {
  it('the owner adds a rider and gets a 5-digit code; a stranger and a customer cannot; the code can be claimed once', async () => {
    await withTx(async (c) => {
      const s = await mkShop(c)
      const made = await callJson(
        c,
        AAL2(s.owner),
        `select public.vendor_rider_create($1,'Musa') r`,
        [s.vendor],
      )
      expect(made.code).toMatch(/^[0-9]{5}$/)
      expect(Number(made.code)).toBeGreaterThanOrEqual(10000)
      const stranger = await createUser(c, 'str2')
      expect(
        (
          await callFails(c, AAL2(stranger), `select public.vendor_rider_create($1,'Evil')`, [
            s.vendor,
          ])
        ).code,
      ).toBe('42501')
      expect(
        (await callFails(c, AAL2(stranger), `select public.vendor_rider_list($1)`, [s.vendor]))
          .code,
      ).toBe('42501')
      expect(
        (await c.query(`select public.vendor_rider_code_check($1) r`, [made.code])).rows[0].r,
      ).toMatchObject({ vendor_id: s.vendor })
      const r1 = await mkRider(c, { active: false })
      const linked = (await c.query(`select public.rider_link_code($1,$2) r`, [r1.id, made.code]))
        .rows[0].r
      expect(linked.vendor_id).toBe(s.vendor)
      expect(
        (await c.query(`select public.vendor_rider_code_check($1) r`, [made.code])).rows[0].r,
      ).toBeNull()
      const r2 = await mkRider(c, { active: false })
      expect(
        (await failure(c, `select public.rider_link_code($1,$2)`, [r2.id, made.code])).message,
      ).toMatch(/code_not_found/)
      const list = await callJson(c, AAL2(s.owner), `select public.vendor_rider_list($1) r`, [
        s.vendor,
      ])
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ name: 'Musa', linked: true, rider_name: 'Test Rider' })
      expect((await callJson(c, rider(r1.id), `select public.my_rider_link() r`)).vendor_id).toBe(
        s.vendor,
      )
      // the table itself is closed to browsers
      expect((await callFails(c, AAL2(s.owner), `select * from public.vendor_riders`)).code).toBe(
        '42501',
      )
    })
  })
  it('a rider linked to a shop sees and takes only that shop’s orders; after the shop removes them they are a normal rider again', async () => {
    await withTx(async (c) => {
      const mine = await deliveryOrder(c)
      const other = await deliveryOrder(c)
      const rid = await mkRider(c)
      const code = (
        await callJson(c, AAL2(mine.owner), `select public.vendor_rider_create($1,'Own rider') r`, [
          mine.vendor,
        ])
      ).code as string
      const free = await mkRider(c) // an ordinary pool rider
      const both = async (who: string) =>
        (
          (await callJson(c, rider(who), `select public.list_delivery_offers() r`)) as {
            order_id: string
          }[]
        ).map((x) => x.order_id)
      expect(await both(rid.id)).toEqual(expect.arrayContaining([mine.order, other.order]))
      await c.query(`select public.rider_link_code($1,$2)`, [rid.id, code])
      const seen = await both(rid.id)
      expect(seen).toContain(mine.order)
      expect(seen).not.toContain(other.order)
      expect(await both(free.id)).toEqual(expect.arrayContaining([mine.order, other.order]))
      expect(
        (await callFails(c, rider(rid.id), `select public.rider_accept_order($1)`, [other.order]))
          .message,
      ).toMatch(/order_unavailable/)
      expect((await accept(c, rid.id, mine.order)).already_assigned).toBe(false)
      // the shop removes the link: the rider is ordinary again
      const id = (
        await callJson(c, AAL2(mine.owner), `select public.vendor_rider_list($1) r`, [mine.vendor])
      )[0].id
      await as(c, AAL2(mine.owner), () =>
        c.query(`select public.vendor_rider_revoke($1,$2)`, [mine.vendor, id]),
      )
      expect(await both(rid.id)).toContain(other.order)
    })
  })
})
