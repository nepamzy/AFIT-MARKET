'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  dismissCofounderAlertAction,
  listCofounderAlertsAction,
  type CofounderAlert,
} from '@/server/modules/cofounder/popup-actions'

const EVERY_MS = 15_000

/**
 * A pop-up for the owner: whenever the co-founder approves a shop, sends one back with a note, signs up, or a payment
 * date comes near, a card appears over whatever page is open. It checks every 15 seconds while the tab is showing.
 */
export function CofounderAlertPopup() {
  const [alerts, setAlerts] = useState<CofounderAlert[]>([])
  const gone = useRef(new Set<string>())
  useEffect(() => {
    let live = true
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const list = await listCofounderAlertsAction()
        if (live) setAlerts(list.filter((a) => !gone.current.has(a.id)))
      } catch {
        /* a missed check is fine: the next one tries again */
      }
    }
    void check()
    const t = setInterval(check, EVERY_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])
  if (alerts.length === 0) return null
  const close = (id: string) => {
    gone.current.add(id)
    setAlerts((x) => x.filter((a) => a.id !== id))
    void dismissCofounderAlertAction(id)
  }
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed right-3 top-3 z-[60] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2"
    >
      {alerts.map((a) => (
        <div
          key={a.id}
          className="rounded-[var(--radius-card)] border-2 border-gold-400 bg-white p-4 shadow-[var(--shadow-pop)]"
        >
          <p className="font-extrabold text-navy-900">{a.title}</p>
          <p className="mt-1 text-sm">{a.body}</p>
          <div className="mt-3 flex items-center gap-4">
            {a.link && (
              <Link
                href={a.link}
                onClick={() => close(a.id)}
                className="font-bold text-brand-700 underline"
              >
                Open
              </Link>
            )}
            <button
              type="button"
              onClick={() => close(a.id)}
              className="font-semibold text-muted underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
