import { describe, expect, it } from 'vitest'
import { ageOn, parseInterests, parseSignupDetails } from './signup-details'

const today = new Date('2026-11-12T10:00:00Z')

describe('age from a date of birth', () => {
  it('counts whole years and respects the birthday', () => {
    expect(ageOn('2008-11-12', today)).toBe(18)
    expect(ageOn('2008-11-13', today)).toBe(17)
    expect(ageOn('2000-01-31', today)).toBe(26)
  })
  it('refuses dates that do not exist', () => {
    expect(ageOn('2001-02-30', today)).toBeNull()
    expect(ageOn('12/11/2000', today)).toBeNull()
    expect(ageOn('', today)).toBeNull()
  })
})

describe('sign-up details', () => {
  const ok = { fullName: '  Amina  Bello ', phone: '0803 123 4567', dateOfBirth: '2003-05-20' }
  it('accepts a normal person and tidies the name and phone', () => {
    expect(parseSignupDetails(ok, today)).toEqual({
      ok: true,
      fullName: 'Amina Bello',
      phone: '+2348031234567',
      dateOfBirth: '2003-05-20',
    })
  })
  it('refuses a missing name, a bad phone, a bad date and anyone under 18', () => {
    expect(parseSignupDetails({ ...ok, fullName: 'A' }, today).ok).toBe(false)
    expect(parseSignupDetails({ ...ok, fullName: '1234' }, today).ok).toBe(false)
    expect(parseSignupDetails({ ...ok, phone: '12345' }, today).ok).toBe(false)
    expect(parseSignupDetails({ ...ok, dateOfBirth: 'nope' }, today).ok).toBe(false)
    expect(parseSignupDetails({ ...ok, dateOfBirth: '2010-01-01' }, today)).toMatchObject({
      ok: false,
      error: expect.stringContaining('18'),
    })
    expect(parseSignupDetails({ ...ok, dateOfBirth: '1900-01-01' }, today).ok).toBe(false)
  })
})

describe('interests', () => {
  const valid = ['a', 'b', 'c', 'd']
  it('needs at least three live categories', () => {
    expect(parseInterests('["a","b"]', valid).ok).toBe(false)
    expect(parseInterests('["a","b","x"]', valid).ok).toBe(false)
    expect(parseInterests('not json', valid).ok).toBe(false)
    expect(parseInterests('["a","b","c"]', valid)).toEqual({ ok: true, ids: ['a', 'b', 'c'] })
  })
  it('ignores repeats and unknown ids', () => {
    expect(parseInterests('["a","a","b","c","zzz"]', valid)).toEqual({
      ok: true,
      ids: ['a', 'b', 'c'],
    })
  })
})
