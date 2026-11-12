'use client'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/** The customer first chooses how to confirm: by signature (on the other person's phone) or with a QR code. */
export function HandoverChoice({ sign, children }: { sign: ReactNode; children: ReactNode }) {
  const [mode, setMode] = useState<'choose' | 'sign' | 'qr'>('choose')
  if (mode === 'choose')
    return (
      <div className="space-y-3">
        <p>Choose how you confirm.</p>
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
      {mode === 'sign' ? sign : children}
      <Button type="button" variant="secondary" onClick={() => setMode('choose')}>
        Back
      </Button>
    </div>
  )
}
