import { describe, expect, it, vi } from 'vitest'
vi.mock('jsqr', () => ({ default: () => null }))
import { codeFromQr } from './qr-scan-button'

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
