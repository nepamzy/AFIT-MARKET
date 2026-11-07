# AFIT Market: real testing prompt (for the owner and Co-Work)

Copy everything below the line into Co-Work (or follow it yourself).

---

You are testing AFIT Market, a campus marketplace, at https://afit-market.vercel.app. **It runs in test mode: no real money moves. Never type real bank or card details.** Your job is to use it like real students, shops and riders, find what breaks or confuses, and report it clearly. Do not fix anything. Test on a **phone (Android Chrome)** for steps marked 📱, and on a laptop for the rest. Use at least three different e-mail addresses (customer, shop, rider). Keep notes as you go.

## Paystack test payment
On the Paystack page use the test card **4084 0840 8408 4081**, any future expiry, CVV **408**. If asked for a PIN or OTP use the code Paystack shows for test mode (usually **123456**). Test bank transfers are simulated by Paystack.

## A. Customer (order for pickup)
1. Sign up as a customer (choose student, military, lecturer or other). Draw the signature. Confirm 18+. Check the welcome e-mail arrives.
2. Browse items, add one to the cart, choose **Pickup**, pay with the test card.
3. Open the order: it should say the payment is protected for 24 hours. Check the **Notifications** page lists updates.
4. 📱 Tap **Turn on notifications** in the bar at the top. Allow when the phone asks. Leave the app, then have the shop accept the order: a pop-up should appear. With the app open on screen a short "ding-ding" should play once.
5. 📱 Tap **Download app** and add AFIT Market to the home screen. Open it from the icon.

## B. Shop (vendor)
1. Sign up as a vendor, choose a vendor type and categories, and on the application read the **Automatic ready** box. Tick it and choose 30 minutes. Submit. (An administrator approves it: see H.)
2. After approval open **Orders**. A paid order shows "Payment confirmed" and only **Accept order** and **Decline order**.
3. **Decline** an order with a reason. The customer must see "The shop declined this order" with your reason and a refund message. Check the refund in the Paystack test dashboard (it may take minutes). Report if the money does not come back.
4. **Accept** another order. It should go straight to preparing. With automatic ready on, it should show **ready** about 30 minutes after the customer paid (allow one extra minute). Without it, use **Mark ready**.
5. Open **Shop settings > Automatic ready**: change the time, switch it off, switch it on.
6. Open **Earnings**: commission 4.5%, amount due, "paid automatically 24 hours after completion".

## C. Pickup hand-over
1. For a ready pickup order the customer shows the one-time pickup code and signs; the shop enters it on **Handover**. Check the receipt.

## D. Delivery with a rider
1. Customer: order with **Delivery** to an approved delivery point. Note the delivery fee is **not** in the Paystack payment: it is paid straight to the rider by bank transfer (the order page explains). Do not send real money: just check the wording is clear.
2. Rider: sign up as a rider (matric number, phone, photos of the front and back of an ID card; the front needs a QR code). An administrator approves (H). Accept the rider terms, tap **Go Active**, allow location.
3. Rider **Accept delivery** on the Jobs page.
4. 📱 **QR hand-over (new):** on the shop's **Handover** page tap **Show hand-over QR code**. On the rider's phone, Jobs page, tap **Scan the shop's QR code**, allow the camera, point it at the shop's screen. The order must become "picked up" at once. Also try typing the code, a wrong code, and an old code after showing a new one.
5. Rider **Start route**, then at the customer **I have arrived**. Customer and rider sign on the rider's phone. Check the receipt and the 24-hour report window.

## E. A shop's own rider (new)
1. As the shop owner open **My riders**. Create a rider account (name, e-mail, phone). You get an e-mail, a temporary password and a 5-digit code, shown once. Write them down.
2. Try creating a second rider with the **same e-mail**: it must refuse.
3. In a private window sign in with that e-mail and password. Open "I am a shop rider and I have a code" and first type a **wrong** code (refused), then the right one. Draw the signature. The rider home must say "You are a rider for [shop]". Reusing the code must fail.
4. That rider must see only that shop's orders. A normal rider must still see every shop's.
5. Remove the rider from **My riders**: they must stop being a rider.

## F. Orders nobody answers
Place a paid order and do not accept or decline it. After about 15 hours (the system checks every day, so check the next morning) it should be declined with "The shop did not answer in time" and refunded.

## G. Everyday checks
- Wrong password: the message should be helpful. "Forgot your password?" should send a code.
- Account page: ask for a copy of data; close an account (use a spare account).
- Contact form, FAQ, Terms, Privacy, Payments, Refunds and Delivery pages: read each. Report anything that is wrong, unclear or promises something the app does not do.
- Try the site at phone width (360 px): nothing should need sideways scrolling.

## H. Administrator
Sign in at the hidden administrator page (tap the logo three times on the home page). Approve the vendor and rider applications. Look at Payments, Refunds, Settlements, Audit.

## How to report
For every problem write: **where** (page and role), **what you did**, **what you expected**, **what happened**, **a screenshot**, and **severity**: *blocker* (cannot continue), *wrong* (does the wrong thing), *confusing* (works but unclear), *cosmetic*. List what you could not test and why. At the end give a one-page summary: what worked, the top five problems, and anything that might lose or leak money or personal data.

Do not report: the "Download app" button looks different in some browsers; the map points are approximate; the notebook and souvenir-mug pictures are missing (coming); GitHub checks are off.
