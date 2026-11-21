/**
 * Paystack "dynamic split": each shop's own Paystack sub-account receives that shop's share of the payment, and the main
 * account keeps the rest (AFIT's commission, and the Paystack charge the customer paid on top). Shares come from the
 * database (`payment_prepare*` -> `split_shares`), never from the browser.
 */
export type SplitShare = { subaccount: string; share_kobo: number }
export type PaystackSplit = {
  type: 'flat'
  bearer_type: 'account'
  subaccounts: { subaccount: string; share: number }[]
}

const CODE = /^ACCT_[A-Za-z0-9]{6,40}$/

/** One entry per sub-account (shares added together). Null when there is nothing to split or the shares do not fit the amount. */
export function buildSplit(shares: unknown, amountKobo: number): PaystackSplit | null {
  if (!Array.isArray(shares)) return null
  const byAccount = new Map<string, number>()
  for (const s of shares as Partial<SplitShare>[]) {
    const code = String(s?.subaccount ?? '')
    const kobo = Number(s?.share_kobo)
    if (!CODE.test(code) || !Number.isInteger(kobo) || kobo <= 0) continue
    byAccount.set(code, (byAccount.get(code) ?? 0) + kobo)
  }
  if (byAccount.size === 0) return null
  const total = [...byAccount.values()].reduce((a, b) => a + b, 0)
  if (!Number.isInteger(amountKobo) || total >= amountKobo) return null
  return {
    type: 'flat',
    bearer_type: 'account',
    subaccounts: [...byAccount].map(([subaccount, share]) => ({ subaccount, share })),
  }
}
