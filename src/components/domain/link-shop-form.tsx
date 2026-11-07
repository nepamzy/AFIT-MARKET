'use client'
import { useState } from 'react'
import { ActionForm } from '@/components/forms/action-form'
import { CodeBoxes } from '@/components/domain/code-boxes'
import { linkShopCodeAction } from '@/server/modules/riders/actions'

/** A rider who already has an account types the 5-digit code a shop gave them. */
export function LinkShopForm() {
  const [code, setCode] = useState('')
  return (
    <ActionForm action={linkShopCodeAction} submitLabel="Link to the shop" pendingLabel="Linking…">
      <CodeBoxes
        value={code}
        onChange={setCode}
        label="Shop code (5 digits)"
        idPrefix="link-code"
      />
      <input type="hidden" name="shopCode" value={code} />
    </ActionForm>
  )
}
