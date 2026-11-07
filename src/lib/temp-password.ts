import { randomInt } from 'node:crypto'

/** A one-time password a shop hands to a rider it made an account for: 12 characters, easy to read out, meets the password rules. */
export function makeTemporaryPassword(): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const digits = '23456789'
  const pick = (set: string) => set[randomInt(set.length)]!
  const chars = [pick(upper), pick(lower), pick(digits), pick(digits)]
  const all = lower + upper + digits
  while (chars.length < 12) chars.push(pick(all))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
  }
  return chars.join('')
}
