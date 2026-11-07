'use client'
import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ActionForm } from '@/components/forms/action-form'
import { Input } from '@/components/ui/fields'
import { QrScanButton } from '@/components/domain/qr-scan-button'
import { confirmPickupScanAction } from '@/server/modules/riders/actions'

/** The rider collects the parcel: scan the shop's QR code (completes the hand-over at once) or type the code the shop shows. */
export function PickupScanCard() {
  const [token, setToken] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const onCode = useCallback((code: string) => {
    setTimeout(() => {
      flushSync(() => setToken(code))
      box.current?.querySelector('form')?.requestSubmit()
    }, 0)
  }, [])
  return (
    <div ref={box} className="space-y-3" data-testid="pickup-scan">
      <p className="text-sm font-semibold">
        Collecting from the shop? Ask them to show their QR code.
      </p>
      <QrScanButton onCode={onCode} />
      <ActionForm
        action={confirmPickupScanAction}
        submitLabel="Confirm collection"
        pendingLabel="Checking…"
      >
        <Input
          label="Or type the code the shop shows"
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
