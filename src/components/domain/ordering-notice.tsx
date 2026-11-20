import { orderingOpen } from '@/server/modules/cart-and-checkout/ordering'

/** A strip across the top of every page while ordering is closed (waiting for the AFIT board's approval). */
export async function OrderingNotice() {
  if (await orderingOpen()) return null
  return (
    <p
      role="status"
      data-testid="ordering-notice"
      className="bg-gold-400 px-4 py-2 text-center text-sm font-bold text-navy-900"
    >
      Awaiting approval from the AFIT board. You can sign up, apply to sell or deliver, and fill
      your cart. Orders open as soon as it is approved.
    </p>
  )
}
