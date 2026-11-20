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

/**
 * On the rider's phone: when the customer pays on delivery, the hand-over (signature or QR code) stays hidden until the
 * payment has arrived. The page refreshes by itself, so the hand-over appears as soon as the customer has paid.
 */
export async function RiderPaymentGate({
  orderId,
  children,
}: {
  orderId: string
  children: React.ReactNode
}) {
  const { data } = await (
    await createSupabaseServerClient()
  ).rpc('order_payment_view', {
    p_order: orderId,
  })
  const v = data as PaymentView
  if (v?.pay_at_door && !v.paid) {
    return (
      <Alert tone="warning" title="Waiting for the customer to pay">
        This order is paid when it is received (<Money kobo={v.amount_kobo} />
        ). Ask the customer to open their order and pay with Paystack. The signature and QR code
        steps appear here as soon as the payment arrives. Do not hand the order over before that.
      </Alert>
    )
  }
  return (
    <>
      {v?.pay_at_door && (
        <Alert tone="success" title="Paid">
          The customer has paid <Money kobo={v.amount_kobo} />. Now the customer confirms they
          received the order.
        </Alert>
      )}
      {children}
    </>
  )
}
