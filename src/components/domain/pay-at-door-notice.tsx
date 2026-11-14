import { Alert } from '@/components/ui/alert'
import { Money } from '@/components/ui/money'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { PaymentView } from '@/server/modules/payments/pay-on-delivery'

/**
 * For the person handing an order over (the rider at the door, or the shop at the counter): when the customer pays on
 * delivery, say so, and say whether the payment has arrived. The hand-over itself is refused by the database until it has.
 */
export async function PayAtDoorNotice({ orderId }: { orderId: string }) {
  const { data } = await (
    await createSupabaseServerClient()
  ).rpc('order_payment_view', {
    p_order: orderId,
  })
  const v = data as PaymentView
  if (!v?.pay_at_door) return null
  return v.paid ? (
    <Alert tone="success" title="Paid">
      The customer has paid <Money kobo={v.amount_kobo} />. You can hand the order over.
    </Alert>
  ) : (
    <Alert tone="warning" title="The customer pays now">
      This order is paid on delivery (<Money kobo={v.amount_kobo} />
      ). Ask the customer to pay in the app. Do not hand the order over until this says Paid. This
      page updates by itself.
    </Alert>
  )
}
