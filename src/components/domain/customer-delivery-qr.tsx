'use client'
import { useState, useTransition } from 'react'
import { QrImage } from '@/components/domain/qr-image'
import { DELIVERY_QR_PREFIX } from '@/components/domain/qr-scan-button'
import { Button } from '@/components/ui/button'
import { lagosTime } from '@/lib/time'
import {
  customerOpenDeliveryQrAction,
  type CustomerQr,
} from '@/server/modules/orders-and-state-machine/qr-actions'

/** The customer shows this to the rider who has arrived. The rider scans it (or types the code) and the delivery is confirmed. */
export function CustomerDeliveryQr({ orderId }: { orderId: string }) {
  const [qr, setQr] = useState<CustomerQr | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="mt-3 space-y-3">
      <Button
        type="button"
        variant="gold"
        disabled={pending}
        onClick={() => start(async () => setQr(await customerOpenDeliveryQrAction(orderId)))}
      >
        {pending ? 'Making code…' : qr?.ok ? 'Show a new code' : 'Show my QR code to the rider'}
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
          <p className="text-sm font-semibold">Let the rider scan this with their phone</p>
          <QrImage
            value={`${DELIVERY_QR_PREFIX}${orderId}.${qr.token}`}
            label="QR code for the rider to scan"
          />
          <p className="text-sm">
            Or the rider types:{' '}
            <strong className="text-xl tracking-widest" data-testid="delivery-code">
              {qr.token}
            </strong>
          </p>
          <p className="text-sm text-muted">
            Works once, until {lagosTime(qr.expiresAt)}. When the rider scans it, the delivery is
            confirmed.
          </p>
        </div>
      )}
    </div>
  )
}
