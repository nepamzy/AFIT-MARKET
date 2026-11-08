import { z } from 'zod'

const publicish = z.object({
  SITE_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
})
const privileged = z.object({ SUPABASE_SERVICE_ROLE_KEY: z.string().min(10) })
/** Unset or unrecognised means `production`: features that must never run in production fail closed. */
const appEnvSchema = z.enum(['local', 'staging', 'production']).catch('production')

function parse<T extends z.ZodType>(schema: T, label: string): z.infer<T> {
  const r = schema.safeParse(process.env)
  if (!r.success) {
    // Names of the offending variables only - never values.
    const names = r.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Invalid ${label} environment configuration. Check: ${names}`)
  }
  return r.data
}

/** Variables needed for normal server-side requests. Fails fast, never prints values. */
export const serverEnv = () => parse(publicish, 'server')
/** Service-role key. Only call from server-only modules. */
export const serviceEnv = () => parse(privileged, 'service-role')

export type AppEnv = z.infer<typeof appEnvSchema>
export const appEnv = (): AppEnv => appEnvSchema.parse(process.env.APP_ENV)
/** The mock payment button/action exists ONLY when APP_ENV=local (the database flag is a second guard). */
export const mockPaymentsAllowed = () => appEnv() === 'local'

const PAYSTACK_DEFAULT_URL = 'https://api.paystack.co'
/**
 * Paystack config. Fails closed (returns null, payments unavailable) unless PAYSTACK_SECRET_KEY is a well-formed key.
 * A test key (`sk_test_...`) works everywhere; a LIVE key (`sk_live_...`) is accepted only when APP_ENV=production,
 * so a live key pasted into a local or preview environment can never move real money. A custom base URL (the local
 * fake provider) is honoured only when APP_ENV=local.
 */
export function paystackConfig(): {
  secretKey: string
  baseUrl: string
  mode: 'test' | 'live'
} | null {
  const secretKey = process.env.PAYSTACK_SECRET_KEY ?? ''
  const mode = /^sk_test_[A-Za-z0-9_]{8,}$/.test(secretKey)
    ? 'test'
    : /^sk_live_[A-Za-z0-9_]{8,}$/.test(secretKey) && appEnv() === 'production'
      ? 'live'
      : null
  if (!mode) return null
  const custom = process.env.PAYSTACK_BASE_URL
  const baseUrl = custom && appEnv() === 'local' ? custom.replace(/\/+$/, '') : PAYSTACK_DEFAULT_URL
  return { secretKey, baseUrl, mode }
}

/** 'live' only when a real-money key is configured in production; otherwise 'test'. Used to word the screens. */
export const paystackIsLive = () => paystackConfig()?.mode === 'live'

/**
 * Server-only secret from which pickup codes are derived (HMAC). Never stored in the database, never sent to the
 * browser. Missing, short or placeholder values throw: there is no fallback, so a misconfigured deployment cannot
 * silently use a predictable secret.
 */
export function pickupCodeSecret(): string {
  const v = process.env.PICKUP_CODE_SECRET ?? ''
  if (v.length < 32 || !/^[A-Za-z0-9+/=_-]+$/.test(v) || /replace-with|changeme|example/i.test(v)) {
    throw new Error('PICKUP_CODE_SECRET is missing or invalid (use at least 32 random characters)')
  }
  return v
}
