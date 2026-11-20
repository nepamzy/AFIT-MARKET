# Cowork prompt: get Paystack Transfers (shop payouts) working

Paste everything below the line into Cowork. You (the owner) must be signed in to the Paystack dashboard first.

---

You are helping me fix shop payouts for AFIT Market (https://afit-market.vercel.app). I am signed in to my Paystack dashboard. Work only in the Paystack dashboard, in **Live** mode. Take a screenshot after each step and tell me what you see. Never type, read out or copy any secret key. If a step needs a one-time code, a password, a document upload or a bank approval, stop and ask me. Do not change anything that is not listed here.

## The problem
Our server sends payouts to shops with the Paystack Transfers API. Every live transfer is refused with this exact message from Paystack:

> You cannot initiate third party payouts as a starter business

Everything on our side (the shop's bank account, the transfer recipient, the amount) is already in place. The block is on the Paystack account itself. I want Transfers (payouts to third-party bank accounts) turned on for the live account.

## What to do, in this order
1. **Account level.** Open Settings, then Business (or Compliance / Account activation). Tell me what the account is called ("Starter business" or something else), and list exactly what Paystack says is needed to move up from Starter (for example business registration documents, CAC certificate, director's ID, BVN, proof of address, a website, a business bank account). Do not upload anything yet; list the requirements and what is already done.
2. **Transfers page.** Open Transfers. Tell me whether the Transfers feature is available, locked or limited on the live account, and read me any message shown there (including any "upgrade" or "contact support" button).
3. **Transfer settings.** If Transfers are available, open the transfer settings and turn **OFF** "Confirm transfers before sending" (OTP approval) because our server sends payouts without anyone typing a code. If Paystack asks for an IP allow-list for API transfers, do not add any address; tell me exactly what it asks for.
4. **Balance.** Tell me the current Paystack balance available for transfers. Payouts and refunds both come from this balance, so tell me if it is empty or if there is a balance that is not yet settled.
5. **Upgrade or support.** If the account must be upgraded, start the upgrade for me as far as the dashboard allows without uploading documents, then open the support chat (or the Contact Support form) and send this message, filling in nothing secret:

   "Hello Paystack. Our live account is a marketplace for a university campus in Nigeria. Our server sends payouts to shop owners and every transfer is rejected with: 'You cannot initiate third party payouts as a starter business'. Please tell us exactly what is needed to enable Transfers to third-party bank accounts on this live account, and enable it once we have provided it."

6. **After it is enabled.** Do not send any money yourself. Tell me it is enabled and I will let the AFIT Market server try the waiting payouts again (they retry on their own).

## Report back
Finish with a short table: step, what you found, done or needs me. Say clearly whether Paystack lets a Starter business make third-party transfers at all, and if it does not, what the shortest route to upgrade is. Do not guess: if a page looks different from what I described, say what you see.
