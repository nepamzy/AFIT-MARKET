'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  dbFailed,
  done,
  failed,
  gate,
  nairaToKobo,
  text,
  type ActionState,
} from '@/server/modules/shared/action-helpers'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const MONTH = /^\d{4}-\d{2}-01$/

const owner = () => gate({ roles: ['platform_admin'], aal: 'aal2' })

/** Naira typed in a box -> kobo; an empty box -> null (not set). Returns undefined when the text is not an amount. */
function money(fd: FormData, key: string): number | null | undefined {
  const v = text(fd, key, 20)
  if (v === '') return null
  return nairaToKobo(v) ?? undefined
}

export async function saveCofounderSettingsAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const g = await owner()
  if ('state' in g) return g.state
  const signing = text(fd, 'signing_date', 10)
  const grad = text(fd, 'graduation_date', 10)
  if (!DATE.test(signing) || !DATE.test(grad))
    return failed('Enter the signing and graduation dates.')
  if (grad <= signing) return failed('Graduation must be after the signing date.')
  const stake = Number(text(fd, 'stake_percent', 6))
  const floor = money(fd, 'floor_per_percent')
  const costs = money(fd, 'default_running_costs')
  if (!(stake > 0 && stake <= 50)) return failed('The stake must be between 0 and 50 percent.')
  if (floor === undefined || floor === null)
    return failed('Enter the floor price for each 1% of stake.')
  if (costs === undefined || costs === null) return failed('Enter the usual monthly running costs.')
  const cliff = Number(text(fd, 'cliff_active_months', 2))
  const mult = Number(text(fd, 'valuation_multiple', 5))
  const school = Number(text(fd, 'school_share_percent', 5))
  const bad = Number(text(fd, 'bad_leaver_percent', 3))
  if (!Number.isInteger(cliff) || cliff < 0 || cliff > 12)
    return failed('The cliff is 0 to 12 active months.')
  if (!(mult >= 0.5 && mult <= 10)) return failed('The valuation multiple is between 0.5 and 10.')
  if (!(school >= 0 && school <= 50))
    return failed("The school's share is between 0 and 50 percent.")
  if (!Number.isInteger(bad) || bad < 0 || bad > 100)
    return failed('The bad-leaver percentage is 0 to 100.')
  const day = (k: string) => Number(text(fd, k, 2))
  const days = [day('statement_day'), day('payment_day'), day('school_payment_day')]
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 28))
    return failed('The due days must be between 1 and 28.')
  const sb = await createSupabaseServerClient()
  const { error } = await sb.rpc('admin_cofounder_save_settings', {
    p: {
      cofounder_name: text(fd, 'cofounder_name', 80),
      signing_date: signing,
      graduation_date: grad,
      stake_bps: Math.round(stake * 100),
      cliff_active_months: cliff,
      valuation_multiple: mult,
      floor_per_percent_kobo: floor,
      bad_leaver_percent: bad,
      school_share_bps: Math.round(school * 100),
      default_running_costs_kobo: costs,
      statement_day: days[0],
      payment_day: days[1],
      school_payment_day: days[2],
    },
  })
  if (error) return dbFailed(error)
  await sb.rpc('admin_cofounder_fill_months')
  revalidatePath('/admin/cofounder')
  return done('Saved. The months between the two dates are ready below.')
}

export async function saveCofounderMonthAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const g = await owner()
  if ('state' in g) return g.state
  const month = text(fd, 'month', 10)
  if (!MONTH.test(month)) return failed('That month is not valid.')
  const costs = money(fd, 'running_costs')
  const other = money(fd, 'other_deductions')
  const school = money(fd, 'school_override')
  if (costs === undefined || other === undefined || school === undefined)
    return failed('Enter amounts in naira, for example 129070.')
  const sb = await createSupabaseServerClient()
  const { error } = await sb.rpc('admin_cofounder_save_month', {
    p_month: month,
    p: {
      active: fd.get('active') === 'on',
      running_costs_kobo: costs,
      other_deductions_kobo: other ?? 0,
      school_share_override_kobo: school,
      note: text(fd, 'note', 200),
    },
  })
  if (error) return dbFailed(error)
  revalidatePath('/admin/cofounder')
  return done('Month saved.')
}

/** Records that the owner paid the co-founder or the school for a month. */
export async function markCofounderPaidAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await owner()
  if ('state' in g) return g.state
  const month = text(fd, 'month', 10)
  const who = text(fd, 'who', 10)
  const on = text(fd, 'paid_on', 10)
  const amount = money(fd, 'amount')
  if (!MONTH.test(month) || (who !== 'cofounder' && who !== 'school'))
    return failed('That is not valid.')
  if (!DATE.test(on)) return failed('Enter the date you paid.')
  if (amount === undefined || amount === null) return failed('Enter the amount you paid, in naira.')
  const sb = await createSupabaseServerClient()
  const key = who === 'cofounder' ? 'cofounder' : 'school'
  const { error } = await sb.rpc('admin_cofounder_save_month', {
    p_month: month,
    p: { [`${key}_paid_kobo`]: amount, [`${key}_paid_on`]: on },
  })
  if (error) return dbFailed(error)
  revalidatePath('/admin/cofounder')
  return done('Recorded as paid.')
}

/** Makes the co-founder's personal sign-up link (it works once). A new link cancels an unused one. */
export async function createCofounderInviteAction(
  _p: ActionState,
  _fd: FormData,
): Promise<ActionState> {
  const g = await owner()
  if ('state' in g) return g.state
  const sb = await createSupabaseServerClient()
  const { error } = await sb.rpc('admin_create_cofounder_invite')
  if (error) return dbFailed(error)
  revalidatePath('/admin/cofounder')
  return done('The link is ready below.')
}

export async function revokeCofounderInviteAction(fd: FormData): Promise<void> {
  const id = String(fd.get('inviteId') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) return
  const g = await owner()
  if ('state' in g) return
  await (await createSupabaseServerClient()).rpc('admin_revoke_cofounder_invite', { p_id: id })
  revalidatePath('/admin/cofounder')
}
