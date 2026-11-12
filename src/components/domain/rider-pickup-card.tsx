'use client'
import { useState } from 'react'
import { ActionForm } from '@/components/forms/action-form'
import { PickupQrCard } from '@/components/domain/pickup-qr-card'
import { SignaturePad } from '@/components/domain/signature-pad'
import { Button } from '@/components/ui/button'
import { vendorRiderPickupSignedAction } from '@/server/modules/riders/handoff-actions'

/** The shop hands an order to the rider. First a choice: the rider signs on this phone, or the rider scans the shop's QR code. */
export function RiderPickupCard({ orderId }: { orderId: string }) {
  const [mode, setMode] = useState<'choose' | 'sign' | 'qr'>('choose')
  if (mode === 'choose')
    return (
      <div className="space-y-3">
        <p>Choose how the rider confirms they collected the order.</p>
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
  return (
    <div className="space-y-3">
      {mode === 'sign' ? (
        <ActionForm
          action={vendorRiderPickupSignedAction}
          submitLabel="Hand over to rider"
          pendingLabel="Checking…"
          variant="gold"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <SignaturePad
            name="rider_signature"
            label="The rider signs here, with a finger"
            hint="Hand the phone to the rider. It must look like the signature they registered."
          />
          <p className="text-sm text-muted">
            If the signature is not accepted, go back and use a QR code instead.
          </p>
        </ActionForm>
      ) : (
        <PickupQrCard orderId={orderId} />
      )}
      <Button type="button" variant="secondary" onClick={() => setMode('choose')}>
        Back
      </Button>
    </div>
  )
}
