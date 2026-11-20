'use client'
import { useEffect, useState } from 'react'

/**
 * A short pop-up that says the platform is using the person's location while their order is open. It asks nothing: it
 * shows once per browser session, hides itself after a few seconds, and closes when tapped.
 */
export function LocationNotice({ text, id }: { text: string; id: string }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try {
      if (sessionStorage.getItem(`afit-loc-notice-${id}`)) return
      sessionStorage.setItem(`afit-loc-notice-${id}`, '1')
    } catch {
      /* private window: the notice may show again, which is harmless */
    }
    const on = window.setTimeout(() => setShow(true), 0)
    const off = window.setTimeout(() => setShow(false), 9000)
    return () => {
      window.clearTimeout(on)
      window.clearTimeout(off)
    }
  }, [id])
  if (!show) return null
  return (
    <button
      type="button"
      role="status"
      onClick={() => setShow(false)}
      className="fixed inset-x-3 bottom-20 z-[2000] mx-auto max-w-md rounded-[var(--radius-card)] bg-navy-900 px-4 py-3 text-left text-sm font-semibold text-white shadow-lg"
    >
      <span aria-hidden="true">📍 </span>
      {text}
    </button>
  )
}
