import { afterAll, describe, expect, it } from 'vitest'
import { AAL2, as, failure, pool, withTx } from './helpers'
import { paidOrder } from './refund-helpers'
import type { PoolClient } from 'pg'

afterAll(async () => {
  await pool.end()
})

const act = (
  c: PoolClient,
  who: string,
  order: string,
  action: string,
  reason: string | null = null,
) =>
  as(
    c,
    AAL2(who),
    async () =>
      (await c.query(`select public.vendor_transition_order($1,$2,$3) s`, [order, action, reason]))
        .rows[0].s,
  )
const status = async (c: PoolClient, order: string) =>
  (await c.query(`select status from public.orders where id=$1`, [order])).rows[0].status as string
describe('shop accepts or declines a paid order', () => {
  it('accept starts preparing at once; mark ready works from there (and from the older ACCEPTED state)', async () => {
    await withTx(async (c) => {
      const o = await paidOrder(c, { status: 'PAID' })
      expect(await act(c, o.owner, o.order, 'accept')).toBe('PREPARING')
      const h = (
        await c.query(
          `select to_status from public.order_status_history where order_id=$1 order by id`,
          [o.order],
        )
      ).rows.map((r) => r.to_status)
      expect(h.slice(-2)).toEqual(['ACCEPTED', 'PREPARING'])
      expect(await act(c, o.owner, o.order, 'mark_ready')).toBe('PICKUP_AWAITING_HANDOVER')

      const old = await paidOrder(c, { status: 'ACCEPTED' })
      expect(await act(c, old.owner, old.order, 'mark_ready')).toBe('PICKUP_AWAITING_HANDOVER')
    })
  })

  it('decline needs a reason, cancels the order and gives the stock back', async () => {
    await withTx(async (c) => {
      const o = await paidOrder(c, { status: 'PAID' })
      expect(
        (
          await as(c, AAL2(o.owner), () =>
            failure(c, `select public.vendor_transition_order($1,'reject',null)`, [o.order]),
          )
        ).message,
      ).toMatch(/reason_required/)
      expect(await act(c, o.owner, o.order, 'reject', 'Sold out today')).toBe('CANCELLED')
      const why = (
        await c.query(
          `select reason from public.order_status_history where order_id=$1 and to_status='CANCELLED'`,
          [o.order],
        )
      ).rows[0].reason
      expect(why).toBe('vendor_rejected: Sold out today')
    })
  })
})

describe('automatic refund of a declined order', () => {
  const start = (c: PoolClient, order: string) =>
    c
      .query(`select public.refund_auto_start($1,'paystack_test') r`, [order])
      .then((r) => r.rows[0].r)

  it('makes one full refund, approved by the system and processing; asking again returns the same one', async () => {
    await withTx(async (c) => {
      const o = await paidOrder(c, { status: 'PAID' })
      await act(c, o.owner, o.order, 'reject', 'Sold out today')
      const a = await start(c, o.order)
      expect(a.status).toBe('processing')
      expect(Number(a.amount_kobo)).toBe(o.received)
      expect(a.reference).toMatch(/^AFM-/)
      const row = (
        await c.query(
          `select source, status, provider_mode, decided_at from public.refunds where id=$1`,
          [a.id],
        )
      ).rows[0]
      expect(row).toMatchObject({
        source: 'auto',
        status: 'processing',
        provider_mode: 'paystack_test',
      })
      expect(row.decided_at).not.toBeNull()
      const b = await start(c, o.order)
      expect(b.id).toBe(a.id)
      expect(
        (await c.query(`select count(*)::int n from public.refunds where order_id=$1`, [o.order]))
          .rows[0].n,
      ).toBe(1)
    })
  })

  it('records the Paystack result: success writes the ledger line once; the order stays declined', async () => {
    await withTx(async (c) => {
      const o = await paidOrder(c, { status: 'PAID' })
      await act(c, o.owner, o.order, 'reject', 'Closing early')
      const a = await start(c, o.order)
      await c.query(`select public.refund_set_provider_ref($1,'paystack-refund-77')`, [a.id])
      await c.query(
        `select public.refund_provider_outcome($1,'succeeded','paystack-refund-77','test')`,
        [a.id],
      )
      await c.query(
        `select public.refund_provider_outcome($1,'succeeded','paystack-refund-77','test')`,
        [a.id],
      ) // replay
      const paid = (
        await c.query(
          `select count(*)::int n, sum(amount_kobo)::bigint s from public.ledger_entries where order_id=$1 and entry_type='refund_paid'`,
          [o.order],
        )
      ).rows[0]
      expect(paid.n).toBe(1)
      expect(Number(paid.s)).toBe(o.received)
      expect(await status(c, o.order)).toBe('CANCELLED')
      expect(await start(c, o.order)).toMatchObject({ status: 'succeeded' })
    })
  })

  it('does nothing for an order that was not declined, or that was never paid', async () => {
    await withTx(async (c) => {
      const o = await paidOrder(c, { status: 'PREPARING' })
      expect(
        (
          await as(c, null, () =>
            failure(c, `select public.refund_auto_start($1,'paystack_test')`, [o.order]),
          )
        ).code,
      ).toBe('42501')
      await expect(start(c, o.order)).rejects.toThrow(/order_not_declined/)
    })
  })

  it('is closed to browsers and finds declined orders whose refund never started', async () => {
    await withTx(async (c) => {
      const o = await paidOrder(c, { status: 'PAID' })
      await act(c, o.owner, o.order, 'reject', 'Out of gas')
      for (const sql of [
        `select public.refund_auto_start('${o.order}','paystack_test')`,
        `select public.refund_auto_unfinished(5)`,
        `select public.refund_auto_missing(5)`,
      ]) {
        expect((await as(c, AAL2(o.owner), () => failure(c, sql))).code).toBe('42501')
        expect((await as(c, null, () => failure(c, sql))).code).toBe('42501')
      }
      const missing = (await c.query(`select public.refund_auto_missing(50) m`)).rows[0]
        .m as string[]
      expect(missing).toContain(o.order)
      await start(c, o.order)
      const after = (await c.query(`select public.refund_auto_missing(50) m`)).rows[0].m as string[]
      expect(after).not.toContain(o.order)
    })
  })
})
