import { afterAll, describe, expect, it } from 'vitest'
import { pool } from './helpers'

afterAll(async () => {
  await pool.end()
})

describe('administrator settings', () => {
  it('every setting the platform stores has an allowed-values rule, so none can silently become uneditable', async () => {
    const r = await pool.query(
      `select s.key from public.platform_settings s where not exists (select 1 from app_private.setting_rule(s.key)) order by 1`,
    )
    expect(r.rows.map((x) => x.key)).toEqual([])
  })
  it('the delivery-fee mode and the location interval are among the editable ones', async () => {
    for (const key of [
      'delivery_fee_collection_mode',
      'location_send_interval_seconds',
      'vendor_response_hours',
      'payout_hold_hours',
    ]) {
      const r = await pool.query(`select kind from app_private.setting_rule($1)`, [key])
      expect(r.rowCount, key).toBe(1)
    }
  })
})
