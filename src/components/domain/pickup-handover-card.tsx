'use client'
import { useCallback, useRef, useState, useTransition } from 'react'
import { flushSync } from 'react-dom'
import { ActionForm } from '@/components/forms/action-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/fields'
import { HandoverForm } from '@/components/domain/handover-form'
import { PICKUP_ORDER_QR_PREFIX, QrScanButton } from '@/components/domain/qr-scan-button'
import { lagosTime } from '@/lib/time'
import {
  completePickupByCodeAction,
  vendorOpenPickupQrAction,
  type ShopPickupQr,
} from '@/server/modules/orders-and-state-machine/qr-actions'

/**
 * A customer collecting their own order. The shop first chooses: signature (the customer gives their pickup code and
 * signs on the shop's phone) or QR code (the shop shows a code and the customer scans it, or the customer shows their
 * pickup QR code and the shop scans it or types the code).
 */
export function PickupHandoverCard({ orderId }: { orderId: string }) {
  const [mode, setMode] = useState<'choose' | 'sign' | 'qr'>('choose')
  const [qr, setQr] = useState<ShopPickupQr | null>(null)
  const [code, setCode] = useState('')
  const [pending, start] = useTransition()
  const scanBox = useRef<HTMLDivElement>(null)
  const onScanned = useCallback(
    (payload: string) => {
      const [scannedOrder = '', c = ''] = payload.split('.')
      if (scannedOrder !== orderId.toLowerCase()) return
      setTimeout(() => {
        flushSync(() => setCode(c))
        scanBox.current?.querySelector('form')?.requestSubmit()
      }, 0)
    },
    [orderId],
  )
  if (mode === 'choose')
    return (
      <div className="space-y-3">
        <p>Choose how the customer confirms they collected the order.</p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => setMode('sign')}>
            Use signature
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode('qr')}>
            Use QR code
          </Button>
        </div>
      </div>
    )
  if (mode === 'sign')
    return (
      <div className="space-y-3">
        <p className="font-semibold">The customer signs on this phone</p>
        <HandoverForm orderId={orderId} typedEnabled={false} />
        <p className="text-sm text-muted">
          If the signature is not accepted, go back and use a QR code instead.
        </p>
        <Button type="button" variant="secondary" onClick={() => setMode('choose')}>
          Back
        </Button>
      </div>
    )
  return (
    <div className="space-y-4">
      <div ref={scanBox} className="space-y-3" data-testid="pickup-scan-customer">
        <p className="font-semibold">Customer shows their QR code</p>
        <QrScanButton
          onCode={onScanned}
          prefix={PICKUP_ORDER_QR_PREFIX}
          label="Scan the customer’s QR code"
        />
        <ActionForm
          action={completePickupByCodeAction}
          submitLabel="Complete handover"
          pendingLabel="Checking…"
          variant="gold"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <Input
            label="Pickup code from the customer"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            required
          />
        </ActionForm>
      </div>
      <div className="space-y-3 border-t border-line pt-3">
        <p className="font-semibold">Or the shop shows a QR code</p>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => start(async () => setQr(await vendorOpenPickupQrAction(orderId)))}
        >
          {pending ? 'Making code…' : qr?.ok ? 'Show a new code' : 'Show QR code to the customer'}
        </Button>
        {qr && !qr.ok && (
          <p role="alert" className="font-medium text-danger-700">
            {qr.error}
          </p>
        )}
        {qr?.ok && (
          <div
            role="status"
            className="space-y-2 rounded-[var(--radius-control)] bg-brand-50 p-3 text-center"
          >
            <p className="text-sm font-semibold">Let the customer scan this with their phone</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr.qr}
              alt="QR code for the customer to scan"
              width={240}
              height={240}
              className="mx-auto rounded bg-white p-1"
            />
            <p className="text-sm text-muted">
              Works once, until {lagosTime(qr.expiresAt)}. The customer must be signed in. When they
              confirm, the order is complete.
            </p>
          </div>
        )}
      </div>
      <Button type="button" variant="secondary" onClick={() => setMode('choose')}>
        Back
      </Button>
    </div>
  )
}
