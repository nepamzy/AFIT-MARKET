# Analytics

**Admin tab:** Administration > Analytics (platform admin or finance admin, second factor required). Periods: 7, 30, 90 days.

## What is counted, and where it comes from
| Number | Source |
| --- | --- |
| Visits (once per browser session), source tag, device | first-party table `analytics_events`, written by `/api/track` |
| App installs (Android, `appinstalled` event), opens of the installed app | same table |
| Sign-ups, alerts turned on, orders, buyers, sales, busiest shops | the main database (exact) |
| Pages, countries, referring sites | **Vercel Web Analytics** (`@vercel/analytics`, no cookies) - see the Vercel dashboard |
| Google reports | **Google tag**, only when `GOOGLE_TAG_ID` is set (see below) |

iPhone "Add to Home Screen" is not reported by iOS, so iPhone installs cannot be counted (opens of the installed app are).
Downloads from the Play Store / App Store cannot be counted until the app is listed there.

## Tagging links
Add `?src=flyer`, `?src=whatsapp` etc. to a link; the visit is filed under that tag. Without a tag the referring site is used (whatsapp, instagram, tiktok, facebook, x, search, other) or `direct`.

## Google tag (the "pixel")
Set `GOOGLE_TAG_ID` (for example `G-XXXXXXXXXX`, from Google Analytics > Admin > Data streams) in Vercel (Production), then redeploy. Until it is set nothing from Google loads. When it is set, the content-security policy allows Google's script and report hosts. IP anonymisation is switched on. **It sets cookies and sends data to Google: the privacy notice and cookie notice must say so first (owner is informing the lawyer).**

## Privacy
`analytics_events` holds only: when, kind, a short source tag, device type. No IP address, no cookie, no user id. The request limiter keys on the address for a minute to stop floods.
