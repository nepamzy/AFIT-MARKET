import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { RefundRejected, createRefund, refundState } from './paystack'

describe('refundState', () => {
  it('folds Paystack words into processed, failed and pending', () => {
    expect(refundState('processed')).toBe('processed')
    expect(refundState('failed')).toBe('failed')
    for (const w of ['pending', 'processing', 'needs-attention', undefined, 'new-word'])
      expect(refundState(w)).toBe('pending')
  })
})

describe('createRefund', () => {
  const real = process.env.PAYSTACK_SECRET_KEY
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_unit_test_key_123'
  })
  afterEach(() => {
    process.env.PAYSTACK_SECRET_KEY = real
    vi.restoreAllMocks()
  })
  const reply = (status: number, body: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }))

  it('asks Paystack for the payment reference and exact amount, and returns its refund id', async () => {
    const f = reply(200, { status: true, data: { id: 991, status: 'pending' } })
    const r = await createRefund({
      reference: 'AFM-REF-1',
      amountKobo: 300000,
      note: 'The shop declined your order.',
    })
    expect(r).toEqual({ state: 'pending', ref: 'paystack-refund-991' })
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/refund$/)
    expect(JSON.parse(String(init.body))).toMatchObject({
      transaction: 'AFM-REF-1',
      amount: 300000,
    })
  })
  it('a processed refund is reported as processed', async () => {
    reply(200, { status: true, data: { id: 5, status: 'processed' } })
    expect((await createRefund({ reference: 'AFM-REF-1', amountKobo: 100, note: 'x' })).state).toBe(
      'processed',
    )
  })
  it('a 4xx answer is a refusal (do not retry); a 5xx answer is a plain error (retry later)', async () => {
    reply(400, { status: false, message: 'Transaction has already been fully reversed' })
    await expect(
      createRefund({ reference: 'AFM-REF-1', amountKobo: 100, note: 'x' }),
    ).rejects.toBeInstanceOf(RefundRejected)
    reply(503, { status: false })
    const e = await createRefund({ reference: 'AFM-REF-1', amountKobo: 100, note: 'x' }).catch(
      (x) => x,
    )
    expect(e).toBeInstanceOf(Error)
    expect(e).not.toBeInstanceOf(RefundRejected)
  })
})
