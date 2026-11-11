import { describe, expect, it } from 'vitest'
import { cleanSource, deviceOf } from './analytics'

describe('analytics helpers', () => {
  it('names the device from the browser description', () => {
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 7)')).toBe('android')
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios')
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop')
    expect(deviceOf('curl/8')).toBe('other')
  })
  it('keeps short tags and turns anything odd into other', () => {
    expect(cleanSource(' WhatsApp ')).toBe('whatsapp')
    expect(cleanSource(undefined)).toBe('direct')
    expect(cleanSource('')).toBe('direct')
    expect(cleanSource('a b<script>')).toBe('other')
    expect(cleanSource('x'.repeat(41))).toBe('other')
  })
})
