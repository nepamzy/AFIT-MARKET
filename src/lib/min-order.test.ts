import { describe, expect, it } from 'vitest'
import { belowMinimum, MIN_CHECKOUT_KOBO, MIN_ORDER_MESSAGE } from './min-order'

describe('minimum checkout', () => {
  it('is ₦150', () => expect(MIN_CHECKOUT_KOBO).toBe(15_000))
  it('blocks anything under ₦150 and allows ₦150 and over', () => {
    expect(belowMinimum(10_000)).toBe(true)
    expect(belowMinimum(14_999)).toBe(true)
    expect(belowMinimum(15_000)).toBe(false)
    expect(belowMinimum(BigInt(250_000))).toBe(false)
  })
  it('says the minimum without giving a reason', () => {
    expect(MIN_ORDER_MESSAGE).toContain('₦150')
    expect(MIN_ORDER_MESSAGE.toLowerCase()).not.toContain('split')
  })
})
