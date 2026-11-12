import { normalizePhone } from './id-card-check'

/**
 * What every new person tells us when they sign up: their full name, a phone number and their date of birth.
 * The date of birth is used for one thing only: to make sure the person is 18 or older.
 */
export const MIN_AGE = 18

/** Whole years between a date of birth (YYYY-MM-DD) and today, or null when it is not a real date. */
export function ageOn(dob: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return null
  let age = today.getUTCFullYear() - y
  const beforeBirthday =
    today.getUTCMonth() + 1 < mo || (today.getUTCMonth() + 1 === mo && today.getUTCDate() < d)
  if (beforeBirthday) age -= 1
  return age
}

export type SignupDetails =
  { ok: true; fullName: string; phone: string; dateOfBirth: string } | { ok: false; error: string }

export function parseSignupDetails(
  input: { fullName: string; phone: string; dateOfBirth: string },
  today: Date = new Date(),
): SignupDetails {
  const fullName = input.fullName.replace(/\s+/g, ' ').trim()
  if (fullName.length < 2 || fullName.length > 80 || !/\p{L}/u.test(fullName))
    return { ok: false, error: 'Enter your full name.' }
  const phone = normalizePhone(input.phone)
  if (!phone)
    return { ok: false, error: 'Enter a valid Nigerian phone number, for example 0803 123 4567.' }
  const dateOfBirth = input.dateOfBirth.trim()
  const age = ageOn(dateOfBirth, today)
  if (age === null || age > 110) return { ok: false, error: 'Enter your date of birth.' }
  if (age < MIN_AGE) return { ok: false, error: 'AFIT Market is only for people aged 18 and over.' }
  return { ok: true, fullName, phone, dateOfBirth }
}

/** What the person would like to shop. The ids must be live categories; the list is never fixed in the code. */
export const MIN_INTERESTS = 3
export function parseInterests(
  raw: string,
  validIds: string[],
): { ok: true; ids: string[] } | { ok: false; error: string } {
  let list: unknown
  try {
    list = JSON.parse(raw || '[]')
  } catch {
    list = []
  }
  const valid = new Set(validIds)
  const ids = [
    ...new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []),
  ].filter((id) => valid.has(id))
  if (ids.length < MIN_INTERESTS)
    return { ok: false, error: `Pick at least ${MIN_INTERESTS} things you would like to shop.` }
  return { ok: true, ids: ids.slice(0, 40) }
}
