import { describe, expect, it, vi } from 'vitest'
vi.mock('jsqr', () => ({ default: () => null }))
import {
  DELIVERY_QR_PREFIX,
  PICKUP_ORDER_QR_PREFIX,
  codeFromQr,
  orderCodeFromQr,
} from './qr-scan-button'

describe('codeFromQr', () => {
  it('reads the rider hand-over code from the QR text', () => {
    expect(codeFromQr('afit-pickup:3FA9C20B17')).toBe('3FA9C20B17')
    expect(codeFromQr('  AFIT-PICKUP:abc123  ')).toBe('ABC123')
  })
  it('ignores anything else', () => {
    for (const t of [
      '',
      'https://evil.example',
      'afit-pickup:',
      'afit-pickup:12',
      'afit-pickup:bad code!',
      'x afit-pickup:ABCD1234',
    ])
      expect(codeFromQr(t)).toBeNull()
  })
})

describe('orderCodeFromQr', () => {
  const id = '3b6c1d62-8a53-4f10-9d0e-0a1b2c3d4e5f'
  it('reads an order id and code', () => {
    expect(orderCodeFromQr(`${DELIVERY_QR_PREFIX}${id}.ab12cd34ef`, DELIVERY_QR_PREFIX)).toEqual({
      orderId: id,
      code: 'AB12CD34EF',
    })
    expect(
      orderCodeFromQr(`${PICKUP_ORDER_QR_PREFIX}${id.toUpperCase()}.K4M9`, PICKUP_ORDER_QR_PREFIX)
        ?.orderId,
    ).toBe(id)
  })
  it('rejects other prefixes, bad ids and odd codes', () => {
    for (const t of [
      `${PICKUP_ORDER_QR_PREFIX}${id}.ab12cd34ef`,
      `${DELIVERY_QR_PREFIX}notauuid.ab12cd34ef`,
      `${DELIVERY_QR_PREFIX}${id}.bad code`,
      `${DELIVERY_QR_PREFIX}${id}`,
      `https://x.test/${id}.ab12`,
    ])
      expect(orderCodeFromQr(t, DELIVERY_QR_PREFIX)).toBeNull()
  })
})
