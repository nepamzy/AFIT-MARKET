import { loadPrincipal } from '@/server/modules/identity-and-access/guard'
import { canOrderNow } from '@/server/modules/cart-and-checkout/ordering'

/** A strip across the top of every page while ordering is closed to this person (waiting for the AFIT board's approval). */
export async function OrderingNotice() {
  const who = await loadPrincipal()
  if (await canOrderNow(who.userId ?? null, who.roles.includes('platform_admin'))) return null
  return (
    <p
      role="status"
      data-testid="ordering-notice"
      className="bg-gold-400 px-4 py-2 text-center text-sm font-bold text-navy-900"
    >
      Awaiting final approval from the AFIT board. You can sign up, apply to sell or deliver, and fill
      your cart. Orders open as soon as final approval is given.
    </p>
  )
}
