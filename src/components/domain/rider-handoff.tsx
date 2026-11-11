'use client'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { flushSync } from 'react-dom'
import { ActionForm } from '@/components/forms/action-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/fields'
import { DELIVERY_QR_PREFIX, QrScanButton } from '@/components/domain/qr-scan-button'
import { lagosTime } from '@/lib/time'
import {
  riderOpenQrAction,
  riderScanDeliveryAction,
  type QrOpen,
} from '@/server/modules/riders/handoff-actions'

/**
 * At the door, on the RIDER's phone. Two ways to confirm, both with a QR code: the rider shows a code and the customer
 * scans it with their own phone, or the customer shows a code and the rider scans it. There is no signature step.
 */
export function RiderHandoff({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [mode, setMode] = useState<'choose' | 'show' | 'scan'>('choose')
  const [qr, setQr] = useState<QrOpen | null>(null)
  const [token, setToken] = useState('')
  const [pending, start] = useTransition()
  const box = useRef<HTMLElement>(null)
  const scanBox = useRef<HTMLDivElement>(null)
  // the rider has just tapped "I have arrived": bring the hand-over into view so there is nothing to look for
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [])

  const openQr = () =>
    start(async () => {
      setQr(await riderOpenQrAction(orderId))
      setMode('show')
    })
  const onScanned = useCallback(
    (payload: string) => {
      const [scannedOrder = '', code = ''] = payload.split('.')
      if (scannedOrder !== orderId.toLowerCase()) return
      setTimeout(() => {
        flushSync(() => setToken(code))
        scanBox.current?.querySelector('form')?.requestSubmit()
      }, 0)
    },
    [orderId],
  )

  return (
    <section
      ref={box}
      aria-labelledby={`handoff-${orderId}`}
      className="space-y-3 rounded-[var(--radius-card)] border-2 border-brand-700 p-4"
    >
      <h3 id={`handoff-${orderId}`} className="text-lg font-extrabold">
        Arrived: hand over order {orderNumber}
      </h3>
      {mode === 'choose' && (
        <>
          <p>Choose how the customer confirms they received the order. Both use a QR code.</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={openQr} disabled={pending}>
              {pending ? 'Making code…' : 'Show my QR code'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode('scan')}>
              Scan the customer’s QR code
            </Button>
          </div>
        </>
      )}
      {mode === 'show' && (
        <div className="space-y-3">
          {qr && qr.ok ? (
            <>
              <p className="font-semibold">
                Ask the customer to scan this code with their phone and confirm.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr.qr}
                alt={`QR code to confirm delivery of order ${orderNumber}`}
                data-confirm-url={qr.url}
                width={260}
                height={260}
                className="rounded-lg border border-line bg-white p-2"
              />
              <p className="text-sm text-muted">
                The code works for 10 minutes (until {lagosTime(qr.expiresAt)}). The customer must
                be signed in on their phone. This page updates when they have confirmed.
              </p>
            </>
          ) : (
            <p role="alert" className="font-medium text-danger-700">
              {qr && !qr.ok ? qr.error : 'A code could not be made.'}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={openQr} disabled={pending}>
              New code
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode('choose')}>
              Back
            </Button>
          </div>
        </div>
      )}
      {mode === 'scan' && (
        <div ref={scanBox} className="space-y-3" data-testid="delivery-scan">
          <p className="font-semibold">
            Ask the customer to open their order and tap “Show my QR code”, then scan it.
          </p>
          <QrScanButton
            onCode={onScanned}
            prefix={DELIVERY_QR_PREFIX}
            label="Scan the customer’s QR code"
          />
          <ActionForm
            action={riderScanDeliveryAction}
            submitLabel="Confirm delivery"
            pendingLabel="Checking…"
            variant="gold"
          >
            <input type="hidden" name="orderId" value={orderId} />
            <Input
              label="Or type the code the customer shows"
              name="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              required
            />
          </ActionForm>
          <Button type="button" variant="secondary" onClick={() => setMode('choose')}>
            Back
          </Button>
        </div>
      )}
    </section>
  )
}
