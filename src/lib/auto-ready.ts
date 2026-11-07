/** The waiting times a shop can choose for "automatic ready". */
export const AUTO_READY_CHOICES = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '1 hour 30 minutes' },
  { minutes: 120, label: '2 hours' },
  { minutes: 180, label: '3 hours' },
] as const

export type AutoReadyInput = { enabled: boolean; minutes: number | null }

/** Reads the form: "autoReady" tick box and "autoReadyMinutes" choice. Ticked without a valid time is an error. */
export function parseAutoReady(
  fd: FormData,
): { ok: true; value: AutoReadyInput } | { ok: false; error: string } {
  const enabled = fd.get('autoReady') === 'on'
  if (!enabled) return { ok: true, value: { enabled: false, minutes: null } }
  const minutes = Number(fd.get('autoReadyMinutes'))
  if (!AUTO_READY_CHOICES.some((c) => c.minutes === minutes))
    return { ok: false, error: 'Choose how long after payment an order should become ready.' }
  return { ok: true, value: { enabled: true, minutes } }
}
