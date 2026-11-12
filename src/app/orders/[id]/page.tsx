import { lagosDateTime, lagosTime } from '@/lib/time'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AutoRefresh } from '@/components/domain/auto-refresh'
import { OrderStatusPill, ORDER_STATES } from '@/components/domain/order-status'
import { OrderTracking } from '@/components/domain/order-tracking'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { Timeline } from '@/components/ui/timeline'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { ReviewForm } from '@/components/domain/engagement-forms'
import { myOrderReview } from '@/server/modules/engagement/queries'
import { deliveryFeeForOrder } from '@/server/modules/delivery-fee/queries'
import { ActionForm } from '@/components/forms/action-form'
import { CustomerScanButton } from '@/components/domain/customer-scan-button'
import { QrImage } from '@/components/domain/qr-image'
import { PICKUP_ORDER_QR_PREFIX } from '@/components/domain/qr-scan-button'
import { CustomerDeliveryQr } from '@/components/domain/customer-delivery-qr'
import { mockPaymentsAllowed, paystackConfig, paystackIsLive } from '@/lib/env'
import { cancelOrderAction, mockPayAction } from '@/server/modules/cart-and-checkout/actions'
import { payWithPaystackAction } from '@/server/modules/payments/actions'
import {
  getOrder,
  getPickupCode,
  listPaymentTransactions,
} from '@/server/modules/orders-and-state-machine/queries'

export const metadata: Metadata = { title: 'Order' }

/** True while the moment is still ahead of the server clock. */
const isInFuture = (d: Date | null) => d !== null && d.getTime() > Date.now()

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const found = await getOrder((await params).id)
  if (!found) notFound()
  const { order, items, history, payments } = found
  const unpaid = order.status === 'PENDING_PAYMENT'
  // a shop that declined a paid order: show its reason and where the refund stands (this customer's own order only)
  const declined =
    order.status === 'CANCELLED'
      ? [...history]
          .reverse()
          .find((h) => h.to_status === 'CANCELLED' && h.reason?.startsWith('vendor_rejected'))
      : undefined
  const declineReason = declined?.reason?.replace(/^vendor_rejected:?\s*/, '') ?? ''
  const autoRefund = declined
    ? (
        await createSupabaseServiceClient()
          .from('refunds')
          .select('status, amount_kobo')
          .eq('order_id', order.id)
          .eq('source', 'auto')
          .order('created_at', { ascending: false })
          .limit(1)
      ).data?.[0]
    : undefined
  const paystack = paystackConfig() !== null
  const pickup = order.status === 'PICKUP_AWAITING_HANDOVER' ? await getPickupCode(order.id) : null
  const txns = await listPaymentTransactions(order.id)
  const review = ['COMPLETED', 'PARTIALLY_REFUNDED'].includes(order.status)
    ? await myOrderReview(order.id)
    : null
  const dfp = order.fulfilment === 'delivery' ? await deliveryFeeForOrder(order.id) : null
  const holdHours = Number(
    (await (await createSupabaseServerClient()).rpc('payout_hold_hours')).data ?? 24,
  )
  const completedAt = history.find((h) => h.to_status === 'COMPLETED')?.created_at ?? null
  const windowEnds = completedAt
    ? new Date(new Date(completedAt).getTime() + holdHours * 3_600_000)
    : null
  const windowOpen = isInFuture(windowEnds)
  const beforeCompletion =
    !completedAt && !['PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'].includes(order.status)
  const hasReceipt = !['PENDING_PAYMENT', 'CANCELLED'].includes(order.status)
  const arrivedForHandover =
    order.fulfilment === 'delivery' &&
    ['ARRIVAL_DETECTED', 'AWAITING_RECIPIENT_PROOF'].includes(order.status)
  const waitingForHandover = arrivedForHandover || order.status === 'PICKUP_AWAITING_HANDOVER'
  const onTheWay =
    order.fulfilment === 'delivery' &&
    ['RIDER_ASSIGNED', 'PICKED_UP_BY_RIDER', 'EN_ROUTE', 'ARRIVAL_DETECTED'].includes(order.status)
  // where each step of the timeline takes the customer, when that place is on this page right now
  const placeFor = (status: string): string | undefined => {
    if (status === 'PENDING_PAYMENT' && unpaid) return '#pay'
    if (status === 'PICKUP_AWAITING_HANDOVER' && order.status === status) return '#pickup'
    if (['ARRIVAL_DETECTED', 'AWAITING_RECIPIENT_PROOF'].includes(status) && arrivedForHandover)
      return '#handover'
    if (['RIDER_ASSIGNED', 'PICKED_UP_BY_RIDER', 'EN_ROUTE'].includes(status) && onTheWay)
      return '#tracking'
    return undefined
  }
  const next: { text: string; href?: string; action?: string } | null = unpaid
    ? { text: 'Pay for your order to place it.', href: '#pay', action: 'Go to payment' }
    : order.status === 'PICKUP_AWAITING_HANDOVER'
      ? {
          text: 'Your order is ready to collect. At the shop, sign on the shop’s phone, or use a QR code: scan the shop’s code or show your own.',
          href: '#pickup',
          action: 'Open my pickup QR code',
        }
      : arrivedForHandover
        ? {
            text: 'Your rider is here. Sign on the rider’s phone, or use a QR code: scan the rider’s code or show your own.',
            href: '#handover',
            action: 'Open the hand-over',
          }
        : onTheWay
          ? { text: 'Your rider is on the way.', href: '#tracking', action: 'Watch on the map' }
          : ['PAID', 'VENDOR_REVIEW', 'ACCEPTED', 'PREPARING'].includes(order.status)
            ? { text: 'The shop is preparing your order. Nothing to do yet.' }
            : ['READY', 'AWAITING_RIDER'].includes(order.status)
              ? {
                  text:
                    order.fulfilment === 'delivery'
                      ? 'Your order is ready. We are finding a rider.'
                      : 'Your order is ready.',
                }
              : null
  const label = (c: string) => ORDER_STATES.find((s) => s.code === c)?.label ?? c
  const settled = ['COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(
    order.status,
  )
  return (
    <>
      {!settled && <AutoRefresh everySeconds={waitingForHandover ? 4 : 15} />}
      <PageHeader
        title={order.order_number}
        subtitle={`${order.vendor_name} · ${order.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}`}
        actions={<OrderStatusPill code={order.status} />}
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Orders', href: '/orders' },
          { label: order.order_number },
        ]}
      />
      <Alert tone="info" className="mb-5">
        {ORDER_STATES.find((s) => s.code === order.status)?.meaning}
      </Alert>
      {next && (
        <Card className="mb-5 space-y-2 border-2 border-navy-900" data-testid="next-step">
          <h2 className="text-lg font-extrabold text-navy-900">What to do now</h2>
          <p>{next.text}</p>
          {next.href && next.action && (
            <ButtonLink href={next.href} variant="gold">
              {next.action}
            </ButtonLink>
          )}
        </Card>
      )}

      {declined && (
        <div data-testid="declined">
          <Alert tone="warning" className="mb-5" title="The shop declined this order">
            {declineReason && <>Reason: “{declineReason}”. </>}
            {autoRefund?.status === 'succeeded'
              ? 'Your payment has been refunded. Your bank may take a few days to show it.'
              : 'Your money is being refunded to the card or bank you paid with. We started it as soon as the shop declined. Your bank may take a few days to show it.'}
          </Alert>
        </div>
      )}

      {(beforeCompletion || windowEnds) && (
        <div data-testid="payment-window">
          <Alert
            plain
            tone={windowOpen ? 'warning' : 'info'}
            className="mb-5"
            title="Your payment is protected for 24 hours"
          >
            {beforeCompletion && (
              <>
                Your payment is held safely. When your order is completed you have {holdHours} hours
                to report a problem and ask for your money back. After that, the payment is released
                to the shop.
              </>
            )}
            {windowEnds && windowOpen && (
              <>
                Something wrong with your order? You can report it until{' '}
                {lagosDateTime(windowEnds.toISOString())}. After that the payment is released to the
                shop.{' '}
                <Link className="font-semibold underline" href={`/orders/${order.id}/help`}>
                  Report a problem
                </Link>
              </>
            )}
            {windowEnds && !windowOpen && (
              <>
                The {holdHours}-hour window to report a problem has ended and the payment has been
                released to the shop.
              </>
            )}
          </Alert>
        </div>
      )}

      {unpaid && (
        <Card
          id="pay"
          className="mb-5 scroll-mt-20 space-y-3 border-2 border-gold-400 bg-accent-50/50"
        >
          <h2 className="text-lg font-extrabold text-navy-900">Payment needed</h2>
          <p>
            Total to pay: <Money kobo={order.total_kobo} className="font-bold" />
            {order.expires_at && (
              <span className="text-sm text-muted"> · hold ends {lagosTime(order.expires_at)}</span>
            )}
          </p>
          <p className="text-sm text-muted">
            Your payment is held safely. The shop is paid {holdHours} hours after your order is
            completed, and you can report a problem until then.
          </p>
          <div className="flex flex-wrap gap-3">
            {paystack && (
              <ActionForm
                action={payWithPaystackAction}
                submitLabel={
                  paystackIsLive() ? 'Pay with Paystack' : 'Pay with Paystack (test mode)'
                }
                pendingLabel="Opening payment…"
              >
                <input type="hidden" name="orderId" value={order.id} />
              </ActionForm>
            )}
            {mockPaymentsAllowed() ? (
              <form action={mockPayAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <Button type="submit">Pay (test only, no real money)</Button>
              </form>
            ) : (
              !paystack && (
                <p className="font-medium text-warning-700">Online payment is not open yet.</p>
              )
            )}
            <form action={cancelOrderAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <Button type="submit" variant="secondary">
                Cancel order
              </Button>
            </form>
          </div>
          {mockPaymentsAllowed() && (
            <p className="text-xs text-muted">
              <Badge tone="warning">Test mode</Badge> This is a rehearsal. Real card payment arrives
              in a later release.
            </p>
          )}
        </Card>
      )}

      {dfp && dfp.state !== 'not_applicable' && (
        <Card className="mb-5 space-y-2 border-brand-700">
          <h2 className="text-lg font-extrabold text-navy-900">
            Delivery fee
            {dfp.state === 'payment' && dfp.status === 'awaiting_transfer' && (
              <Badge tone="warning" className="ml-2">
                To do
              </Badge>
            )}
          </h2>
          <p>
            {dfp.state === 'payment'
              ? dfp.status === 'awaiting_transfer'
                ? 'Your order was delivered. Send the delivery fee straight to your rider by bank transfer.'
                : 'You pay this delivery fee directly to your rider by bank transfer. Open it to see where things stand.'
              : dfp.state === 'ready_to_open'
                ? 'The delivery fee was not part of your online payment. You pay it to your rider by bank transfer.'
                : dfp.state === 'rider_details_missing'
                  ? 'Your rider has not added bank details yet. This page updates when they do; you have not been charged.'
                  : 'You will pay the delivery fee to your rider by bank transfer after your order is delivered. It is not part of the online payment, and a button appears here when it is time.'}
          </p>
          {(dfp.state === 'payment' || dfp.state === 'ready_to_open') && (
            <Link
              href={`/orders/${order.id}/delivery-fee`}
              className="inline-block font-semibold text-brand-700 underline"
            >
              Pay Delivery Fee
            </Link>
          )}
        </Card>
      )}

      {order.status === 'PICKUP_AWAITING_HANDOVER' && (
        <Card id="pickup" className="mb-5 scroll-mt-20 space-y-3 border-brand-700">
          <h2 className="text-lg font-extrabold text-navy-900">Collect your order</h2>
          <p className="text-sm text-muted">
            At the shop, finish in one of two ways: scan the QR code the shop shows you, or let the
            shop scan your QR code below.
          </p>
          <CustomerScanButton label="Scan the shop’s QR code" />
          {pickup ? (
            <>
              <p className="font-semibold">Your pickup code</p>
              <p
                className="text-3xl font-bold tracking-widest"
                aria-label={`Pickup code ${pickup.code.split('').join(' ')}`}
              >
                {pickup.code}
              </p>
              <QrImage
                value={`${PICKUP_ORDER_QR_PREFIX}${order.id}.${pickup.code}`}
                label="QR code for the shop to scan when you collect your order"
              />
              <p className="text-sm text-muted">
                Let the shop scan this QR code, or read the code out to them. Do not share it with
                anyone else.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              Your own pickup code is not available right now. You can still scan the shop’s QR
              code, or contact support.
            </p>
          )}
        </Card>
      )}

      {order.fulfilment === 'delivery' &&
        ['RIDER_ASSIGNED', 'PICKED_UP_BY_RIDER', 'EN_ROUTE', 'ARRIVAL_DETECTED'].includes(
          order.status,
        ) && (
          <Card id="tracking" className="mb-5 scroll-mt-20 space-y-2">
            <h2 className="text-lg font-extrabold text-navy-900">Delivery tracking</h2>
            <OrderTracking orderId={order.id} mapKey={process.env.ARCGIS_API_KEY ?? null} />
          </Card>
        )}

      {order.fulfilment === 'delivery' &&
        ['ARRIVAL_DETECTED', 'AWAITING_RECIPIENT_PROOF'].includes(order.status) && (
          <Card id="handover" className="mb-5 scroll-mt-20 border-brand-700">
            <h2 className="text-lg font-extrabold text-navy-900">Your rider has arrived</h2>
            <p className="mt-1">
              Check that you have everything. Then confirm with a QR code: scan the code your rider
              shows you with this phone, or show your own code and let the rider scan it.
            </p>
            <CustomerDeliveryQr orderId={order.id} />
            <p className="mt-2 text-sm">
              Something missing or wrong? Do not confirm.{' '}
              <a
                className="font-semibold text-brand-700 underline"
                href={`/orders/${order.id}/help`}
              >
                Get help from support
              </a>
              .
            </p>
          </Card>
        )}

      {review?.can_review && (
        <Card className="mb-5 space-y-2">
          <h2 className="text-lg font-extrabold text-navy-900">Review this order</h2>
          <ReviewForm orderId={order.id} />
        </Card>
      )}
      {review?.review && (
        <Card className="mb-5 space-y-1">
          <h2 className="text-lg font-extrabold text-navy-900">Your review</h2>
          <p aria-label={`${review.review.rating} out of 5`}>{'★'.repeat(review.review.rating)}</p>
          {review.review.comment && <p>{review.review.comment}</p>}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="space-y-3">
          <h2 className="text-lg font-extrabold text-navy-900">Items</h2>
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span>
                  {i.quantity} × {i.product_name}
                  {i.options.length > 0 && (
                    <span className="block text-sm text-muted">
                      {i.options.map((o) => o.name).join(', ')}
                    </span>
                  )}
                </span>
                <Money kobo={i.line_total_kobo} />
              </li>
            ))}
          </ul>
          <hr className="border-line" />
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt>Items</dt>
              <dd>
                <Money kobo={order.items_total_kobo} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>
                Delivery
                {order.delivery_fee_collection === 'direct_to_rider' &&
                  ' (paid directly to your rider, not part of the total below)'}
              </dt>
              <dd>
                <Money kobo={order.delivery_fee_kobo} />
              </dd>
            </div>
            {order.platform_fee_kobo > 0 && (
              <div className="flex justify-between">
                <dt>Service fee (charged on earlier orders; no longer applied)</dt>
                <dd>
                  <Money kobo={order.platform_fee_kobo} />
                </dd>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold">
              <dt>
                {order.delivery_fee_collection === 'direct_to_rider'
                  ? 'Total paid online'
                  : 'Total'}
              </dt>
              <dd>
                <Money kobo={order.total_kobo} />
              </dd>
            </div>
          </dl>
          {order.fulfilment === 'delivery' ? (
            <p className="text-sm">
              <strong>Deliver to:</strong> {order.delivery_point_label}
            </p>
          ) : (
            <p className="text-sm">
              <strong>Collect from:</strong> {order.pickup_location_snapshot ?? order.vendor_name}
              {order.prep_minutes_snapshot
                ? ` · ready in about ${order.prep_minutes_snapshot} min`
                : ''}
            </p>
          )}
          {hasReceipt && (
            <p className="text-sm">
              <Link
                className="font-semibold text-brand-700 underline"
                href={`/orders/${order.id}/help`}
              >
                Problem with this order? Report it, or ask for a refund or return
              </Link>
            </p>
          )}
          {hasReceipt && (
            <p className="text-sm">
              <a
                className="font-semibold text-brand-700 underline"
                href={`/orders/${order.id}/receipt`}
              >
                Download receipt (PDF)
              </a>
            </p>
          )}
          {txns.length > 0 && (
            <p className="text-sm text-muted">
              Card payment: {txns.map((t) => t.status).join(', ')}
            </p>
          )}
          {payments.length > 0 && (
            <p className="text-sm text-muted">
              Payment:{' '}
              {payments
                .map((p) => `${p.provider === 'mock' ? 'Test payment' : p.provider} ${p.status}`)
                .join(', ')}
            </p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-extrabold text-navy-900">Order timeline</h2>
          <Timeline
            steps={history.map((h, i) => ({
              label: label(h.to_status),
              detail: lagosDateTime(h.created_at),
              state: i === history.length - 1 ? 'current' : 'done',
              href: i === history.length - 1 ? placeFor(h.to_status) : undefined,
            }))}
          />
        </Card>
      </div>
    </>
  )
}
