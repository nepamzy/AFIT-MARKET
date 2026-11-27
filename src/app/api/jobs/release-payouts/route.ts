import { NextResponse } from 'next/server'
import { jobAuthorized } from '@/server/jobs/auth'

export const dynamic = 'force-dynamic'

/** Switched off: shops are paid by Paystack splits at checkout, so there are no transfers to send. */
async function run(req: Request) {
  if (!jobAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, disabled: true })
}

export const POST = run
export const GET = run
