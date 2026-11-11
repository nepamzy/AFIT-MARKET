import { afterEach, describe, expect, it } from 'vitest'
import { googleTagId } from './google-tag'

describe('googleTagId', () => {
  afterEach(() => {
    delete process.env.GOOGLE_TAG_ID
  })
  it('accepts a well-formed id and rejects everything else', () => {
    process.env.GOOGLE_TAG_ID = ' G-ABCD123456 '
    expect(googleTagId()).toBe('G-ABCD123456')
    for (const bad of ['', 'UA-1234-1', 'G-', 'g-abcd1234', "G-AB';alert(1)//", 'G-AB CD']) {
      process.env.GOOGLE_TAG_ID = bad
      expect(googleTagId(), bad).toBeNull()
    }
    delete process.env.GOOGLE_TAG_ID
    expect(googleTagId()).toBeNull()
  })
})
