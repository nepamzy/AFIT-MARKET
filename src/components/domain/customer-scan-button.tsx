'use client'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { QrScanButton } from '@/components/domain/qr-scan-button'

/** The confirm-link path inside a hand-over QR code: `/confirm/<order>.<code>` (delivery) or `/confirm/pickup/<order>.<code>`. */
export const confirmPathFromQr = (text: string, origin: string): string | null => {
  try {
    const u = new URL(text.trim())
    if (u.origin !== origin) return null
    return /^\/confirm\/(pickup\/)?[0-9a-f-]{36}\.[A-Za-z0-9]{4,24}$/i.test(u.pathname)
      ? u.pathname
      : null
  } catch {
    return null
  }
}

/**
 * The customer scans the rider's (delivery) or the shop's (pickup) QR code inside the app. Only a confirm link on this same
 * site is accepted; it opens the confirm page, where the customer ticks the box to finish.
 */
export function CustomerScanButton({ label }: { label: string }) {
  const router = useRouter()
  const parse = useCallback((text: string) => confirmPathFromQr(text, window.location.origin), [])
  const onCode = useCallback((path: string) => router.push(path), [router])
  return <QrScanButton onCode={onCode} parse={parse} label={label} />
}
