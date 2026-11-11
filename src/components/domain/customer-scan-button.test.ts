import { describe, expect, it, vi } from 'vitest'
vi.mock('jsqr', () => ({ default: () => null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }))
import { confirmPathFromQr } from './customer-scan-button'

const id = '3b6c1d62-8a53-4f10-9d0e-0a1b2c3d4e5f'
const origin = 'https://afit-market.vercel.app'

describe('confirmPathFromQr', () => {
  it('accepts a delivery or pickup confirm link on this site', () => {
    expect(confirmPathFromQr(`${origin}/confirm/${id}.AB12CD34EF56AB12CD34`, origin)).toBe(
      `/confirm/${id}.AB12CD34EF56AB12CD34`,
    )
    expect(confirmPathFromQr(`${origin}/confirm/pickup/${id}.AB12CD34EF56AB12CD34`, origin)).toBe(
      `/confirm/pickup/${id}.AB12CD34EF56AB12CD34`,
    )
  })
  it('refuses other sites, other paths and plain text', () => {
    for (const t of [
      `https://evil.example/confirm/${id}.AB12CD34EF`,
      `${origin}/admin`,
      `${origin}/confirm/notanid.AB12CD34`,
      `afit-pickup:AB12CD34`,
      'hello',
    ])
      expect(confirmPathFromQr(t, origin)).toBeNull()
  })
})
