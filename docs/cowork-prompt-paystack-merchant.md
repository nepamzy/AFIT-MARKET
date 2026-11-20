# Cowork prompt: Paystack merchant side for AFIT Market

Paste everything below the line into Cowork. You (the owner) must be signed in to the Paystack dashboard first.

---

You are helping me finish the Paystack dashboard setup for AFIT Market, a campus marketplace at https://afit-market.vercel.app. I am signed in to my Paystack dashboard. Work only in the Paystack dashboard, in the **Live** mode unless a step says Test. Go step by step, take a screenshot after each change, and tell me what you changed. Never type, read out or copy any secret key. If a step needs a one-time code, a password or a bank approval, stop and ask me. Do not change anything that is not listed here.

## What the platform does (so you know why each setting matters)
- A customer pays on our site through Paystack Checkout. Our server confirms every payment with Paystack and listens to a webhook.
- A customer who buys from several shops pays once; we create one order per shop and pay each shop only for its own items.
- We add Paystack's charge to the customer's bill ourselves (example: items 10,000 + Paystack charge 253.81 = 10,253.81). So **Paystack must not add its fee on top again**.
- We pay shops by Paystack Transfers (bank transfer from our balance) when the report window closes, and we send refunds through the Paystack Refunds API.

## Settings to check and fix, in this order
1. **Who pays the Paystack fees.** Settings, then Preferences (or Transaction fees). Set the fee bearer to **Merchant / my account** (not Customer). This is the most important setting. Tell me what it was before and what it is now.
2. **Webhook.** Settings, then API Keys and Webhooks. Set the **Live Webhook URL** to `https://afit-market.vercel.app/api/webhooks/paystack`. Leave the Test webhook URL empty unless I tell you otherwise. Tell me whether the dashboard shows any recent webhook failures.
3. **Transfers.** Check that Transfers are **enabled** on the live account. Under Transfer settings, turn **OFF** "Confirm transfers before sending" (OTP approval), because our server sends payouts without anyone typing a code. If Paystack asks for an IP allow-list for API transfers, **do not add any address**; just tell me exactly what it says and what it asks for.
4. **Refunds.** Confirm that refunds are available on the live account and tell me what the dashboard says about where refund money comes from (the Paystack balance) and the current available balance. Do not issue any refund.
5. **Payment channels.** Under Preferences, tell me which channels are on (card, bank transfer, USSD, bank, mobile money). Do not change them.
6. **Settlement.** Tell me the settlement schedule (for example next business day) and which bank account receives settlements, showing only the bank name and the last four digits of the account number. Do not change it.
7. **Business verification.** Tell me whether the live account is fully activated and whether anything is still pending (documents, limits, a daily transaction limit or a transfer limit).
8. **Emails.** Tell me whether customer payment receipts are turned on. Do not change it.

## Checks after the settings (ask me before each one that moves money)
- **Small live payment.** Ask me to place a real order of about 100 naira on the site. When I say it is paid, find it under Transactions and confirm: the amount charged equals items plus our Paystack charge, the fees line shows **no extra fee charged to the customer**, and the webhook delivery to `/api/webhooks/paystack` shows a **200** response.
- **Small live refund.** Only after I say so, tell me exactly how to refund that 100 naira order from the AFIT Market admin screen (Refunds, then Send the refund through Paystack) and, afterwards, find the refund under Transactions or Refunds in Paystack and confirm its status.

## Report back
Finish with a short table: setting, value before, value now, done or needs me. List anything Paystack refused to let you change and why. Do not guess: if a page looks different from what I described, say what you see.
