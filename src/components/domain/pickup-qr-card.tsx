'use client'
import { useActionState } from 'react'
import { QrImage } from '@/components/domain/qr-image'
import { Button } from '@/components/ui/button'
import { showPickupQrAction, type PickupTokenState } from '@/server/modules/riders/actions'

/** The shop shows this to the rider collecting the order: a QR code and a short code, good for 15 minutes and for one use. */
export function PickupQrCard({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<PickupTokenState, FormData>(
    showPickupQrAction,
    {},
  )
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      {state.error && (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] bg-danger-50 px-3 py-2 font-medium text-danger-700"
        >
          {state.error}
        </p>
      )}
      {state.token && (
        <div
          role="status"
          className="space-y-2 rounded-[var(--radius-control)] bg-brand-50 p-3 text-center"
        >
          <p className="text-sm font-semibold">Let the rider scan this with their phone</p>
          <QrImage value={`afit-pickup:${state.token}`} label="QR code for the rider to scan" />
          <p className="text-sm">
            Or the rider types:{' '}
            <strong
              className="text-2xl tracking-widest"
              data-testid="pickup-code"
              aria-label={`Hand-over code ${state.token.split('').join(' ')}`}
            >
              {state.token}
            </strong>
          </p>
          <p className="text-sm text-muted">
            Works once and for 15 minutes. When the rider scans it, the hand-over is done.
          </p>
        </div>
      )}
      <Button type="submit" variant="gold" disabled={pending}>
        {state.token ? 'Show a new code' : 'Show hand-over QR code'}
      </Button>
    </form>
  )
}
