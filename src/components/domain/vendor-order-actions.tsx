'use client'
import { ActionForm } from '@/components/forms/action-form'
import { Input } from '@/components/ui/fields'
import { vendorOrderAction } from '@/server/modules/orders-and-state-machine/actions'

/**
 * Payment is already confirmed by Paystack, so the shop only decides: accept (preparing starts at once) or decline with a
 * reason (the customer sees it and is refunded automatically). When the food is ready the shop marks it ready.
 */
export function VendorOrderActions({ orderId, status }: { orderId: string; status: string }) {
  if (status === 'PAID') {
    return (
      <div className="space-y-3">
        <ActionForm action={vendorOrderAction} submitLabel="Accept order" pendingLabel="Accepting…">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="action" value="accept" />
        </ActionForm>
        <ActionForm
          action={vendorOrderAction}
          submitLabel="Decline order"
          pendingLabel="Declining…"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="action" value="reject" />
          <Input label="Reason (the customer will see this)" name="reason" required />
        </ActionForm>
      </div>
    )
  }
  if (status === 'ACCEPTED' || status === 'PREPARING') {
    return (
      <ActionForm action={vendorOrderAction} submitLabel="Mark ready" pendingLabel="Updating…">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="action" value="mark_ready" />
      </ActionForm>
    )
  }
  return <span className="text-sm text-muted">No action needed</span>
}
