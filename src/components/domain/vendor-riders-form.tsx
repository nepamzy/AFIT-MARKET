import { ActionForm } from '@/components/forms/action-form'
import { Input } from '@/components/ui/fields'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  addVendorRiderAction,
  removeVendorRiderAction,
} from '@/server/modules/vendors-and-catalogue/actions'
import type { VendorRiderRow } from '@/server/modules/vendors-and-catalogue/vendor-queries'

export function AddRiderForm({ vendorId }: { vendorId: string }) {
  return (
    <ActionForm
      action={addVendorRiderAction}
      submitLabel="Create rider account"
      pendingLabel="Creating…"
    >
      <input type="hidden" name="vendorId" value={vendorId} />
      <Input label="Rider’s name" name="riderName" required minLength={2} maxLength={60} />
      <Input
        label="Rider’s e-mail"
        name="riderEmail"
        type="email"
        required
        autoComplete="off"
        hint="This becomes the rider’s sign-in e-mail. Use an address that has no AFIT Market account yet."
      />
      <Input label="Rider’s phone" name="riderPhone" type="tel" inputMode="tel" required />
    </ActionForm>
  )
}

export function RiderCards({ vendorId, riders }: { vendorId: string; riders: VendorRiderRow[] }) {
  if (riders.length === 0) return <p className="text-muted">No riders yet.</p>
  return (
    <ul className="space-y-3">
      {riders.map((r) => (
        <li key={r.id}>
          <Card className="space-y-2" data-testid="vendor-rider">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{r.name}</span>
              {r.linked ? (
                <Badge tone="success">Linked</Badge>
              ) : (
                <Badge tone="info">Waiting for the rider’s first sign-in</Badge>
              )}
            </p>
            <p className="text-sm text-muted">
              {r.email} · {r.phone}
            </p>
            {r.code ? (
              <p>
                Rider code:{' '}
                <strong
                  className="text-2xl tracking-[0.3em]"
                  aria-label={`Rider code ${r.code.split('').join(' ')}`}
                >
                  {r.code}
                </strong>
                <span className="block text-sm text-muted">
                  The rider types this when signing in for the first time. It works once.
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted">
                The code was used. This rider is linked to your shop.
              </p>
            )}
            <form action={removeVendorRiderAction}>
              <input type="hidden" name="vendorId" value={vendorId} />
              <input type="hidden" name="riderId" value={r.id} />
              <Button type="submit" variant="secondary">
                Remove rider
              </Button>
            </form>
          </Card>
        </li>
      ))}
    </ul>
  )
}
