import { describe, expect, it } from 'vitest'
import { makeTemporaryPassword } from './temp-password'

describe('makeTemporaryPassword', () => {
  it('meets the password rules (10+ characters, lower, upper, digit) and differs each time', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const p = makeTemporaryPassword()
      expect(p).toMatch(/^[A-Za-z0-9]{12}$/)
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/[0-9]/)
      expect(p).not.toMatch(/[0OIl1]/)
      seen.add(p)
    }
    expect(seen.size).toBe(200)
  })
})
