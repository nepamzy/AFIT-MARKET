# Go-live checklist: switching Paystack from test to live

The app already accepts a live key. Nothing in the code needs to change when you switch.

## Before you paste the key
1. **Business verified on Paystack.** Dashboard > Settings > Business: the account must be activated (documents approved) or live mode will not let you take cards.
2. **Transfers enabled.** Dashboard > Settings > Preferences (or Transfers): transfers on. Needed for paying shops and refunds.
3. **Turn OFF "Confirm transfers before sending" (the OTP)** in live mode. If it stays on, shop payouts get stuck waiting for a code. The app refuses to auto-enter codes in live mode.
4. **Fund the balance.** Shop payouts are sent from your Paystack balance. Card payments from customers fill it, but keep a float for early refunds.
5. **Webhook.** Dashboard > Settings > API Keys & Webhooks > Live webhook URL = `https://afit-market.vercel.app/api/webhooks/paystack` (same URL as test).
6. **Vercel env var `APP_ENV` = `production`** (it is `staging` today; a live key is refused while it is `staging`). Production environment only.

## The switch
1. Vercel > project afit-market > Settings > Environment Variables > `PAYSTACK_SECRET_KEY` (Production): replace with the `sk_live_...` secret key. Never paste the key anywhere else.
2. Redeploy production (Deployments > latest > Redeploy).
3. Open the site: an order's page should say "Pay with Paystack" (no "test mode").

## First real order (do it yourself, small amount)
1. Order a cheap item, pay with a real card. Check it appears in Paystack's live Transactions.
2. Shop accepts. Deliver. Check the order completes.
3. Try a decline on a second small order: the refund should show in Paystack live Refunds.
4. After the 24 h hold, check the shop payout transfer arrives.

## Roll back
Put the old `sk_test_...` key back in Vercel and redeploy. Orders already paid live keep working.
