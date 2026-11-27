import 'server-only'
import {
  computeBoard,
  dueReminders,
  type CofounderMonth,
  type CofounderSettings,
  type Income,
} from '@/lib/cofounder'
import { formatNaira } from '@/lib/money'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { notifyAdmin } from '@/server/modules/engagement/admin-alerts'

/**
 * Daily: works out which co-founder dates are 3 days away, due today or overdue and tells the owner through every channel
 * (in-app notification and push through the normal notification queue, plus the owner's e-mail alert).
 * Each reminder has a fixed key, so running this again never repeats one.
 */
export async function sendCofounderReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const sb = createSupabaseServiceClient()
  const { data, error } = await sb.rpc('cofounder_data_service')
  if (error || !data) throw new Error(error?.code ?? 'no data')
  const d = data as {
    settings: CofounderSettings | null
    months: CofounderMonth[]
    income: Income[]
  }
  if (!d.settings) return { sent: 0 }
  const board = computeBoard(d.settings, d.months, d.income, now)
  if (!board.ready) return { sent: 0 }
  let sent = 0
  for (const r of dueReminders(board.events, now, formatNaira)) {
    const { data: isNew } = await sb.rpc('cofounder_notify_once', {
      p_key: r.key,
      p_title: `Co-founder: ${r.title}`,
      p_body: r.body,
    })
    if (isNew) {
      sent += 1
      notifyAdmin({ type: 'cofounder', title: `Co-founder: ${r.title}`, text: r.body })
    }
  }
  return { sent }
}
