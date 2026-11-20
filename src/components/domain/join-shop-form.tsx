'use client'
import { useActionState, useState } from 'react'
import { CodeBoxes } from '@/components/domain/code-boxes'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/fields'
import { joinShopWithCodeAction } from '@/server/modules/riders/actions'
import type { ActionState } from '@/server/modules/shared/action-helpers'

/** Type the shop's rider code (and your name and phone) to become one of that shop's riders. */
export function JoinShopForm({ defaultName }: { defaultName?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(joinShopWithCodeAction, {})
  const [code, setCode] = useState('')
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <CodeBoxes
        value={code}
        onChange={setCode}
        label="Your shop's rider code"
        idPrefix="shop-code"
        length={6}
      />
      <input type="hidden" name="shopCode" value={code} />
      <Input
        label="Full name"
        name="fullName"
        required
        minLength={2}
        maxLength={80}
        defaultValue={defaultName}
        autoComplete="name"
      />
      <Input label="Phone number" name="phone" type="tel" inputMode="tel" required />
      <p className="text-sm text-muted">
        Ask the shop to tap Generate code for a new rider. The code has 6 digits, works once and
        lasts 10 minutes.
      </p>
      <Button type="submit" variant="gold" disabled={pending || code.length < 6}>
        {pending ? 'Joining…' : 'Join this shop as a rider'}
      </Button>
    </form>
  )
}
