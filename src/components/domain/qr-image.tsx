'use client'
/* eslint-disable @next/next/no-img-element -- a QR code drawn in the browser: nothing to optimise or cache */
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/** A QR code drawn in the browser from short text (here: the rider's one-time hand-over code). Nothing is sent anywhere. */
export function QrImage({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    QRCode.toDataURL(value, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
      .then((u) => live && setSrc(u))
      .catch(() => live && setSrc(null))
    return () => {
      live = false
    }
  }, [value])
  if (!src) return null
  return (
    <img src={src} alt={label} width={220} height={220} className="mx-auto rounded bg-white p-1" />
  )
}
