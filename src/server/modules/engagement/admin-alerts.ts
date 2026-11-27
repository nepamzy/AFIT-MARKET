import 'server-only'
import { after } from 'next/server'
import { logger } from '@/lib/logger'
import { formatNaira } from '@/lib/money'
import { renderEmail } from '@/server/modules/engagement/email-templates'
import { rateLimit } from '@/server/modules/identity-and-access/security'

/**
 * Operator alert e-mails: a short plain-text message to the platform owner for each important event
 * (sign-up, application, order, payment, refund/return request, support case).
 *
 * Rules this module keeps:
 *  - Best effort. A missing configuration, a provider outage or a daily cap NEVER affects the user's request.
 *  - No personal data in the message: e-mail addresses are masked, no names, phones, addresses or order contents.
 *    Free text from users appears only after being stripped of control characters and truncated.
 *  - The subject line is built from fixed strings only (no user text), so it cannot be used to inject headers.
 *  - Server-only. The Brevo API key is read from the environment and is never logged or sent to the browser.
 *  - Capped (200 per rolling day, shared by every server instance through the database limiter) to stay inside the
 *    free Brevo allowance of 300 e-mails a day.
 */

export type AdminAlertEvent =
  | { type: 'signup'; email: string }
  | { type: 'vendor_application'; businessName: string }
  | { type: 'rider_application' }
  | { type: 'order_placed'; orderId: string }
  | { type: 'payment'; outcome: string; amountKobo: number; currency: string; reference: string }
  | { type: 'refund_requested'; orderId: string; by: 'customer' | 'finance' }
  | { type: 'return_requested'; orderId: string }
  | { type: 'support_case'; caseNo: string; kind: string }
  | { type: 'contact_message' }
  | { type: 'delivery_fee'; step: 'reported' | 'confirmed' | 'disputed' }
  | { type: 'payout_failed'; count: number }
  | { type: 'split_refused'; reason: string }
  | { type: 'subaccount_created'; shopName: string }
  | { type: 'cofounder'; title: string; text: string }

export type AdminAlertConfig = { apiKey: string; to: string; from: string; fromName: string }
export type AdminAlertResult = 'sent' | 'disabled' | 'capped' | 'failed'

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'
const DAILY_CAP = 200
/** Payment outcomes worth an e-mail; duplicates, ignored and out-of-order events are not. */
const PAYMENT_OUTCOMES = new Set([
  'paid',
  'late_payment',
  'amount_mismatch',
  'duplicate_payment',
  'failed',
])

export const alertablePaymentOutcome = (o: string) => PAYMENT_OUTCOMES.has(o)

/** Null (alerts off) unless all of BREVO_API_KEY, ADMIN_ALERT_TO and ADMIN_ALERT_FROM are set and well formed. */
export function adminAlertConfig(
  env: Record<string, string | undefined> = process.env,
): AdminAlertConfig | null {
  const apiKey = (env.BREVO_API_KEY ?? '').trim()
  const to = (env.ADMIN_ALERT_TO ?? '').trim()
  const from = (env.ADMIN_ALERT_FROM ?? '').trim()
  if (apiKey.length < 20 || !EMAIL.test(to) || !EMAIL.test(from)) return null
  const fromName = clean(env.ADMIN_ALERT_FROM_NAME ?? '', 40) || 'AFIT Market'
  return { apiKey, to, from, fromName }
}

/** Removes control characters and newlines, collapses spaces, truncates. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g
export function clean(s: string, max: number): string {
  return s.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** `jane.doe@gmail.com` -> `j***@gmail.com` */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  return `${clean(email.slice(0, 1), 1)}***@${clean(email.slice(at + 1), 80)}`
}

const IDENT = /[^A-Za-z0-9._-]/g
const ident = (s: string, max: number) => clean(s, max).replace(IDENT, '')

const ALERT_EMOJI: Record<AdminAlertEvent['type'], string> = {
  signup: '\uD83D\uDC4B',
  vendor_application: '\uD83C\uDFEA',
  rider_application: '\uD83D\uDEB4',
  order_placed: '\uD83D\uDECD\uFE0F',
  payment: '\uD83D\uDCB3',
  refund_requested: '\uD83D\uDCB8',
  return_requested: '\uD83D\uDCE6',
  support_case: '\uD83D\uDCDD',
  contact_message: '\u2709\uFE0F',
  delivery_fee: '\uD83D\uDEB2',
  payout_failed: '\u26A0\uFE0F',
  split_refused: '\u26A0\uFE0F',
  subaccount_created: '\uD83C\uDFE6',
  cofounder: '\uD83E\uDD1D',
}

/** Subject and body for an event. Pure function: nothing here touches the network or the environment. */
export function buildAdminAlert(
  event: AdminAlertEvent,
  siteUrl: string,
  now: Date = new Date(),
): { subject: string; text: string; html: string } {
  const lines: string[] = []
  const extraDetails: Array<[string, string]> = []
  // an event may send the owner somewhere other than the admin area (for example the Paystack dashboard)
  let external: { label: string; url: string } | null = null
  let subject: string
  let link = '/admin'
  switch (event.type) {
    case 'signup':
      subject = '[AFIT Market] New sign-up'
      lines.push(`A new account was created (not yet confirmed): ${maskEmail(event.email)}`)
      link = '/admin/roles'
      break
    case 'vendor_application':
      subject = '[AFIT Market] New vendor application'
      lines.push(`Business: ${clean(event.businessName, 80)}`, 'It is waiting for your decision.')
      link = '/admin/applications'
      break
    case 'rider_application':
      subject = '[AFIT Market] New rider application'
      lines.push('A rider application is waiting for your decision.')
      link = '/admin/riders'
      break
    case 'order_placed':
      subject = '[AFIT Market] New order placed'
      lines.push(`Order id: ${ident(event.orderId, 40)}`, 'Status: waiting for payment.')
      link = '/admin/payments'
      break
    case 'payment':
      subject = '[AFIT Market] Payment update'
      lines.push(
        `Result: ${ident(event.outcome, 30)}`,
        `Amount: ${formatNaira(Math.max(0, Math.trunc(event.amountKobo)))} ${ident(event.currency, 3)}`,
        `Reference: ${ident(event.reference, 60)}`,
      )
      link = '/admin/payments'
      break
    case 'refund_requested':
      subject = '[AFIT Market] Refund requested'
      lines.push(`Order id: ${ident(event.orderId, 40)}`, `Requested by: ${event.by}`)
      link = '/admin/emergency'
      break
    case 'return_requested':
      subject = '[AFIT Market] Return requested'
      lines.push(`Order id: ${ident(event.orderId, 40)}`)
      link = '/admin/returns'
      break
    case 'contact_message':
      subject = '[AFIT Market] New contact message'
      lines.push('A message from the public contact form is waiting.')
      link = '/admin/messages'
      break
    case 'delivery_fee':
      subject = '[AFIT Market] Delivery fee update'
      lines.push(
        event.step === 'reported'
          ? 'A customer says they sent the delivery fee to their rider. The rider has been asked to confirm.'
          : event.step === 'confirmed'
            ? 'A rider confirmed they received the delivery fee. A receipt was issued.'
            : 'A rider says a delivery fee did NOT arrive. It needs your decision.',
      )
      link = '/admin/delivery-fee-payments'
      break
    case 'payout_failed':
      subject = '[AFIT Market] A shop split did not go through'
      lines.push(
        `${Math.max(1, Math.floor(event.count))} split(s) failed. They will be tried again automatically.`,
        'If this keeps happening, check that the shop’s Paystack sub-account is verified and its bank details are right.',
      )
      link = '/admin/payouts'
      break
    case 'split_refused':
      subject = '[AFIT Market] Paystack refused a shop split'
      lines.push(
        'Paystack would not split a customer’s payment between the shops, so the payment went through to your main account without the split.',
        'The shop’s share is still in your Paystack balance. Check that each shop has a verified sub-account and correct bank details, then pay the shop by hand if needed.',
        `Reason from Paystack: ${clean(event.reason, 200)}`,
      )
      link = '/admin/payouts'
      break
    case 'subaccount_created':
      subject = '[AFIT Market] Verify a new shop sub-account in Paystack'
      lines.push(
        `A Paystack sub-account was just created for ${clean(event.shopName, 80)}.`,
        'Paystack holds the first payout to a new sub-account until you verify it, so please do this before the shop gets its first order.',
        'In Paystack open Subaccounts, tick the new one and press "Verify Subaccounts". The held payout is released the next working day.',
      )
      extraDetails.push(
        ['Shop', clean(event.shopName, 80)],
        ['What to do', 'Verify the sub-account'],
      )
      external = {
        label: 'Open Paystack Subaccounts',
        url: 'https://dashboard.paystack.com/v2/subaccounts',
      }
      link = '/admin/vendors'
      break
    case 'cofounder':
      subject = `[AFIT Market] ${clean(event.title, 60)}`
      lines.push(clean(event.text, 200))
      link = '/admin/cofounder'
      break
    case 'support_case':
      subject = '[AFIT Market] New support report'
      lines.push(`Case: ${ident(event.caseNo, 30)}`, `Type: ${ident(event.kind, 30)}`)
      link = '/admin/cases'
      break
  }
  const when = now.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour12: false })
  const base = siteUrl.replace(/\/+$/, '')
  const branded = renderEmail({
    subject,
    preheader: lines[0] ?? subject,
    emoji: ALERT_EMOJI[event.type],
    heading: subject.replace(/^\[AFIT Market\]\s*/, ''),
    paragraphs: lines,
    details: [...extraDetails, ['Time (Lagos)', when]],
    button: external ?? { label: 'Open in the admin area', url: `${base}${link}` },
    note: 'Automatic alert from AFIT Market.',
    siteUrl,
  })
  return {
    subject,
    html: branded.html,
    text: [
      ...lines,
      '',
      `Time (Lagos): ${when}`,
      `Open: ${external?.url ?? `${base}${link}`}`,
      '',
      'Automatic alert from AFIT Market.',
    ].join('\n'),
  }
}

/** Sends one alert now. Never throws. Exported for tests; application code should call `notifyAdmin`. */
export async function sendAdminAlert(
  event: AdminAlertEvent,
  deps: {
    config?: AdminAlertConfig | null
    fetchImpl?: typeof fetch
    siteUrl?: string
    underCap?: () => Promise<boolean>
  } = {},
): Promise<AdminAlertResult> {
  try {
    const config = deps.config === undefined ? adminAlertConfig() : deps.config
    if (!config) return 'disabled'
    const underCap = deps.underCap ?? (() => rateLimit('adminalert:day', 86400, DAILY_CAP))
    if (!(await underCap())) {
      logger.warn('admin alert dropped: daily cap reached')
      return 'capped'
    }
    const { subject, text, html } = buildAdminAlert(
      event,
      deps.siteUrl ?? process.env.SITE_URL ?? 'http://localhost:3000',
    )
    const res = await (deps.fetchImpl ?? fetch)(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': config.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: config.fromName, email: config.from },
        to: [{ email: config.to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      logger.warn('admin alert not accepted by the e-mail provider', { status: res.status })
      return 'failed'
    }
    return 'sent'
  } catch (e) {
    logger.warn('admin alert failed', { err: e instanceof Error ? e.name : 'error' })
    return 'failed'
  }
}

/**
 * Fire and forget: schedules the alert to run after the response is sent. Safe to call from server actions and
 * route handlers; a failure here can never reach the caller.
 */
export function notifyAdmin(event: AdminAlertEvent): void {
  try {
    after(() => sendAdminAlert(event))
  } catch {
    void sendAdminAlert(event)
  }
}
