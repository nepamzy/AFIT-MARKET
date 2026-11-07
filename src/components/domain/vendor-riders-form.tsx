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
    <ActionForm action={addVendorRiderAction} submitLabel="Add rider" pendingLabel="Adding…">
      <input type="hidden" name="vendorId" value={vendorId} />
      <Input label="Rider’s name" name="riderName" required minLength={2} maxLength={60} />
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
                <Badge tone="info">Waiting for the rider</Badge>
              )}
              {r.linked && r.rider_status && r.rider_status !== 'approved' && (
                <Badge tone="warning">Application {r.rider_status}</Badge>
              )}
            </p>
            <p>
              Code:{' '}
              <strong
                className="text-2xl tracking-[0.3em]"
                aria-label={`Rider code ${r.code.split('').join(' ')}`}
              >
                {r.code}
              </strong>
            </p>
            {r.linked && r.rider_name && (
              <p className="text-sm text-muted">Rider account: {r.rider_name}</p>
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
