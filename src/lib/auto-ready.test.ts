import { describe, expect, it } from 'vitest'
import { AUTO_READY_CHOICES, parseAutoReady } from './auto-ready'

const form = (o: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(o)) fd.set(k, v)
  return fd
}

describe('parseAutoReady', () => {
  it('off when the box is not ticked, whatever the time says', () => {
    expect(parseAutoReady(form({ autoReadyMinutes: '60' }))).toEqual({
      ok: true,
      value: { enabled: false, minutes: null },
    })
  })
  it('on with one of the allowed times', () => {
    for (const c of AUTO_READY_CHOICES)
      expect(
        parseAutoReady(form({ autoReady: 'on', autoReadyMinutes: String(c.minutes) })),
      ).toEqual({
        ok: true,
        value: { enabled: true, minutes: c.minutes },
      })
  })
  it('ticked without a valid time is an error', () => {
    for (const m of ['', '45', 'abc', '0', '-60'])
      expect(parseAutoReady(form({ autoReady: 'on', autoReadyMinutes: m })).ok).toBe(false)
  })
})
