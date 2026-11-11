'use client'
import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

/** The text inside the shop's hand-over QR code is `afit-pickup:` followed by the one-time code. */
export const PICKUP_QR_PREFIX = 'afit-pickup:'
export const codeFromQr = (text: string): string | null => {
  const t = text.trim()
  if (!t.toLowerCase().startsWith(PICKUP_QR_PREFIX)) return null
  const code = t.slice(PICKUP_QR_PREFIX.length).trim()
  return /^[A-Za-z0-9]{4,20}$/.test(code) ? code.toUpperCase() : null
}

/** Hand-over codes that carry an order: `<prefix><order id>.<code>`. Returns the order id and the code, or null. */
export const DELIVERY_QR_PREFIX = 'afit-delivery:'
export const PICKUP_ORDER_QR_PREFIX = 'afit-pickup-order:'
export const orderCodeFromQr = (
  text: string,
  prefix: string,
): { orderId: string; code: string } | null => {
  const t = text.trim()
  if (!t.toLowerCase().startsWith(prefix)) return null
  const m = /^([0-9a-fA-F-]{36})\.([A-Za-z0-9]{4,24})$/.exec(t.slice(prefix.length).trim())
  return m ? { orderId: m[1]!.toLowerCase(), code: m[2]!.toUpperCase() } : null
}

/**
 * Opens the phone camera, reads the shop's QR code and hands the code to `onCode`. The camera is only switched on after
 * the tap and is always switched off again. Where the camera is not available the shop can still type the code.
 */
export function QrScanButton({
  onCode,
  prefix,
  label = 'Scan the shop’s QR code',
}: {
  onCode: (code: string) => void
  /** Set to read an order code (`<order id>.<code>`) instead of the shop's code; `onCode` then gets `<order id>.<code>`. */
  prefix?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!open) return
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    let stopped = false
    const stop = () => {
      stopped = true
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (stopped) return stop()
        const v = video.current
        if (!v) return
        v.srcObject = stream
        await v.play()
        const canvas = document.createElement('canvas')
        const g = canvas.getContext('2d', { willReadFrequently: true })
        timer = setInterval(() => {
          if (!g || v.videoWidth === 0) return
          canvas.width = v.videoWidth
          canvas.height = v.videoHeight
          g.drawImage(v, 0, 0)
          const d = g.getImageData(0, 0, canvas.width, canvas.height)
          const hit = jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' })
          if (!hit) return
          const o = prefix ? orderCodeFromQr(hit.data, prefix) : null
          const code = prefix ? (o ? `${o.orderId}.${o.code}` : null) : codeFromQr(hit.data)
          if (!code) return setMsg('That QR code is not an AFIT Market hand-over code.')
          stop()
          setOpen(false)
          onCode(code)
        }, 200)
      } catch {
        setMsg('The camera could not be opened. Type the code instead.')
        setOpen(false)
      }
    })()
    return stop
  }, [open, onCode, prefix])

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="gold"
        onClick={() => {
          setMsg('')
          setOpen((o) => !o)
        }}
      >
        {open ? 'Close camera' : label}
      </Button>
      {open && (
        <video
          ref={video}
          muted
          playsInline
          className="aspect-square w-full max-w-xs rounded-[var(--radius-control)] bg-black object-cover"
          aria-label="Camera view. Point it at the QR code."
        />
      )}
      {msg && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {msg}
        </p>
      )}
    </div>
  )
}
