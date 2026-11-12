'use client'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

const MIN_INK_PIXELS = 150

/** Counts dark pixels so an accidental tap or a lone dot does not pass as a signature. */
function inkPixels(c: HTMLCanvasElement): number {
  const g = c.getContext('2d')
  if (!g) return 0
  const d = g.getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (d[i]! < 128) n++
  return n
}

/** Draw-to-sign box. Writes a PNG data URL into a hidden `signature` field; touch, pen and mouse supported. */
export function SignaturePad({
  label = 'Recipient signature',
  hint = 'Ask the recipient to sign with a finger or stylus.',
  name = 'signature',
  onSignedChange,
}: {
  /** The form field the drawing is sent in. Use different names when one form holds two pads. */
  name?: string
  label?: string
  /** The sentence above the signed / not signed status. */
  hint?: string
  onSignedChange?: (signed: boolean) => void
}) {
  const uid = useId()
  const canvas = useRef<HTMLCanvasElement>(null)
  const signedRef = useRef(false)
  // the finished drawing is kept here, and the canvas is wiped, so nobody looking at the screen afterwards sees the signature
  const capturedPng = useRef<string | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drawing = useRef(false)
  const [signed, setSigned] = useState(false)
  const [wiped, setWiped] = useState(false)
  // the parent's callback may be a new function on every render; keep the latest without re-running effects
  const changed = useRef(onSignedChange)
  useEffect(() => {
    changed.current = onSignedChange
  })

  const ctx = () => canvas.current?.getContext('2d') ?? null
  const reset = useCallback(() => {
    const c = canvas.current
    const g = ctx()
    if (!c || !g) return
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, c.width, c.height)
    g.lineWidth = 3
    g.lineCap = 'round'
    g.strokeStyle = '#111111'
    signedRef.current = false
    setWiped(false)
    capturedPng.current = null
    if (settle.current) clearTimeout(settle.current)
    setSigned(false)
    changed.current?.(false)
  }, [])
  useEffect(() => reset(), [reset])
  // Add the image at submit time. (React resets the form after every action, which would wipe a hidden input
  // while the drawn signature is still visible; the canvas itself is not affected by a form reset.)
  useEffect(() => {
    const form = canvas.current?.closest('form')
    if (!form) return
    const onFormData = (e: FormDataEvent) => {
      // A single tap or a dot is not a signature: require a minimum amount of ink before the image is sent at all.
      if (capturedPng.current) e.formData.set(name, capturedPng.current)
      else if (signedRef.current && canvas.current && inkPixels(canvas.current) >= MIN_INK_PIXELS)
        e.formData.set(name, canvas.current.toDataURL('image/png'))
    }
    form.addEventListener('formdata', onFormData)
    return () => form.removeEventListener('formdata', onFormData)
  }, [name])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    }
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    if (settle.current) clearTimeout(settle.current)
    const p = pos(e)
    const g = ctx()!
    g.beginPath()
    g.moveTo(p.x, p.y)
    g.lineTo(p.x + 0.01, p.y + 0.01)
    g.stroke()
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const p = pos(e)
    const g = ctx()!
    g.lineTo(p.x, p.y)
    g.stroke()
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    signedRef.current = true
    setSigned(true)
    changed.current?.(true)
    // a moment after the last stroke: keep the drawing, wipe the screen and show "captured"
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const c = canvas.current
      if (!c || drawing.current) return
      if (inkPixels(c) < MIN_INK_PIXELS) return
      capturedPng.current = c.toDataURL('image/png')
      const g = ctx()
      if (g) {
        g.fillStyle = '#ffffff'
        g.fillRect(0, 0, c.width, c.height)
      }
      setWiped(true)
    }, 900)
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold" id={`${uid}-label`}>
        {label}
      </p>
      <canvas
        ref={canvas}
        width={600}
        height={220}
        role="img"
        aria-labelledby={`${uid}-label`}
        aria-describedby={`${uid}-hint`}
        className={`w-full touch-none rounded-[var(--radius-control)] border-2 border-dashed border-line-strong bg-white ${wiped ? 'hidden' : ''}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {wiped && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-[var(--radius-control)] border-2 border-success-700 bg-success-50 px-4 py-6 font-semibold text-success-700"
        >
          <span aria-hidden="true" className="text-3xl">
            ✓
          </span>
          Signature captured. It has been cleared from the screen.
        </div>
      )}
      <p id={`${uid}-hint`} aria-live="polite" className="text-sm text-muted">
        {hint} {signed ? 'Signature captured.' : 'Nothing signed yet.'}
      </p>
      <Button type="button" variant="secondary" onClick={reset}>
        {wiped ? 'Sign again' : 'Clear signature'}
      </Button>
    </div>
  )
}
