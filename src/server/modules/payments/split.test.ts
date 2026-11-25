import { describe, expect, it } from 'vitest'
import { buildSplit, describeSplit } from './split'

describe('buildSplit', () => {
  it('adds the shares of the same sub-account together and keeps the main account out', () => {
    const s = buildSplit(
      [
        { subaccount: 'ACCT_aaaaaaaa', share_kobo: 95_500 },
        { subaccount: 'ACCT_bbbbbbbb', share_kobo: 47_750 },
        { subaccount: 'ACCT_aaaaaaaa', share_kobo: 4_500 },
      ],
      160_000,
    )
    expect(s).toEqual({
      type: 'flat',
      bearer_type: 'account',
      subaccounts: [
        { subaccount: 'ACCT_aaaaaaaa', share: 100_000 },
        { subaccount: 'ACCT_bbbbbbbb', share: 47_750 },
      ],
    })
  })
  it('splits nothing when there are no shares, a bad code, or the shares do not leave anything for AFIT', () => {
    expect(buildSplit([], 100_000)).toBeNull()
    expect(buildSplit(undefined, 100_000)).toBeNull()
    expect(buildSplit([{ subaccount: 'nope', share_kobo: 10 }], 100_000)).toBeNull()
    expect(buildSplit([{ subaccount: 'ACCT_aaaaaaaa', share_kobo: 0 }], 100_000)).toBeNull()
    expect(buildSplit([{ subaccount: 'ACCT_aaaaaaaa', share_kobo: 100_000 }], 100_000)).toBeNull()
    expect(buildSplit([{ subaccount: 'ACCT_aaaaaaaa', share_kobo: 100_001 }], 100_000)).toBeNull()
  })
})

describe('describeSplit', () => {
  it('lists the amount, what the main account keeps and every share, with no secrets', () => {
    const split = buildSplit(
      [
        { subaccount: 'ACCT_aaaaaaaa', share_kobo: 95_500 },
        { subaccount: 'ACCT_bbbbbbbb', share_kobo: 47_750 },
      ],
      160_000,
    )!
    expect(describeSplit(split, 160_000)).toBe(
      'flat/account amount=160000 shares_total=143250 main_keeps=16750 [ACCT_aaaaaaaa=95500, ACCT_bbbbbbbb=47750]',
    )
  })
})
