'use client'
import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ActionForm } from '@/components/forms/action-form'
import { Input } from '@/components/ui/fields'
import { QrScanButton } from '@/components/domain/qr-scan-button'
import { confirmRiderPickupAction } from '@/server/modules/riders/actions'

/** The shop hands the parcel to the rider: scan the rider's QR code (confirms at once) or type the code shown on the phone. */
export function RiderPickupForm({ orderId }: { orderId: string }) {
  const [token, setToken] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const onCode = useCallback((code: string) => {
    // a scan is the confirmation: put the code in the box first, then submit the form
    setTimeout(() => {
      flushSync(() => setToken(code))
      box.current?.querySelector('form')?.requestSubmit()
    }, 0)
  }, [])
  return (
    <div ref={box} className="space-y-3">
      <QrScanButton onCode={onCode} />
      <ActionForm
        action={confirmRiderPickupAction}
        submitLabel="Hand parcel to rider"
        pendingLabel="Checking…"
      >
        <input type="hidden" name="orderId" value={orderId} />
        <Input
          label="Or type the code shown on the rider’s phone"
          name="token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          required
        />
      </ActionForm>
    </div>
  )
}
