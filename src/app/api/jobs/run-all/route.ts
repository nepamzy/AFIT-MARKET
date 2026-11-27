import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { jobAuthorized } from '@/server/jobs/auth'
import { drainNotifications } from '@/server/modules/engagement/dispatch'
import { settleAutoRefunds } from '@/server/modules/refunds/auto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The one scheduled entry point (hosting cron calls it every day): expires unpaid orders, deletes old GPS history, sends any
 * waiting notifications and pays the shops whose waiting time is over. Each step is independent and safe to repeat.
 */
async function run(req: Request) {
  if (!jobAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sb = createSupabaseServiceClient()
  const report: Record<string, unknown> = {}
  const step = async (job: string, fn: () => Promise<unknown>) => {
    try {
      report[job] = await fn()
      await sb.rpc('record_job_run', { p_job: job, p_ok: true, p_detail: {} })
    } catch (e) {
      logger.error('scheduled job failed', { job, err: String(e).slice(0, 160) })
      report[job] = 'failed'
      await sb.rpc('record_job_run', { p_job: job, p_ok: false, p_detail: {} })
    }
  }
  await step('expire-orders', async () => {
    const { data, error } = await sb.rpc('expire_unpaid_orders')
    if (error) throw new Error(error.code)
    return data
  })
  await step('purge-location', async () => {
    const { error } = await sb.rpc('purge_location_data')
    if (error) throw new Error(error.code)
    return 'done'
  })
  await step('dispatch-notifications', () => drainNotifications(40))
  await step('settle-refunds', async () => {
    // timers that normally run every minute inside the database: run once a day here as a fallback
    const ready = await sb.rpc('auto_ready_run')
    const declined = await sb.rpc('auto_decline_unanswered')
    const refunds = await settleAutoRefunds(20)
    return { ready: ready.data ?? 0, declined: declined.data ?? 0, ...refunds }
  })
  return NextResponse.json({ ok: true, report })
}

export const POST = run
export const GET = run
