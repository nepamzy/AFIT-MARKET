import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/forms/action-form'
import { Alert } from '@/components/ui/alert'
import { Card, PageHeader } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { paystackConfig, paystackIsLive } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { payCheckoutAction } from '@/server/modules/payments/actions'
import { z } from 'zod'

export const metadata: Metadata = { title: 'Your orders' }
export const dynamic = 'force-dynamic'

type Summary = {
  orders: {
    id: string
    order_number: string
    vendor_name: string
    fulfilment: 'pickup' | 'delivery'
    status: string
    total_kobo: number
    pay_on_delivery: boolean
    is_food: boolean
    paid: boolean
    door_charge_kobo: number
  }[]
  pay_now_count: number
  pay_now_items_kobo: number
  pay_now_charge_kobo: number
  pay_now_total_kobo: number
}

/** Shown after a checkout with more than one shop: every order, and one button that pays for all the unpaid ones together. */
export default async function PlacedPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  if (!z.uuid().safeParse(id).success) notFound()
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('checkout_summary', { p_checkout: id })
  const s = data as Summary | null
  if (error || !s || s.orders.length === 0) notFound()
  return (
    <>
      <PageHeader
        title="Your orders"
        subtitle={`${s.orders.length} orders placed`}
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Orders', href: '/orders' },
        ]}
      />
      {s.pay_now_count > 0 && (
        <Card className="mb-5 space-y-3 border-2 border-gold-400 bg-accent-50/50">
          <h2 className="text-lg font-extrabold text-navy-900">Pay for all in one go</h2>
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt>
                {s.pay_now_count} {s.pay_now_count === 1 ? 'order' : 'orders'}
              </dt>
              <dd>
                <Money kobo={s.pay_now_items_kobo} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Paystack charge</dt>
              <dd>
                <Money kobo={s.pay_now_charge_kobo} />
              </dd>
            </div>
            <div className="flex justify-between text-lg font-extrabold text-navy-900">
              <dt>Checkout total</dt>
              <dd>
                <Money kobo={s.pay_now_total_kobo} />
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted">
            Each shop is paid for its own items. You can also open an order and pay for it on its
            own.
          </p>
          {paystackConfig() ? (
            <ActionForm
              action={payCheckoutAction}
              submitLabel={paystackIsLive() ? 'Pay with Paystack' : 'Pay with Paystack (test mode)'}
              pendingLabel="Opening payment…"
            >
              <input type="hidden" name="checkoutId" value={id} />
            </ActionForm>
          ) : (
            <p className="font-medium text-warning-700">Online payment is not open yet.</p>
          )}
        </Card>
      )}
      <ul className="space-y-3">
        {s.orders.map((o) => (
          <li key={o.id}>
            <Card className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/orders/${o.id}`}
                  className="font-bold text-navy-900 underline-offset-2 hover:underline"
                >
                  {o.order_number} · {o.vendor_name}
                </Link>
                <Money kobo={o.total_kobo} className="font-bold" />
              </div>
              <p className="text-sm text-muted">
                {o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'} ·{' '}
                {o.paid
                  ? 'Paid'
                  : o.pay_on_delivery
                    ? 'You pay when you receive it'
                    : o.status === 'PENDING_PAYMENT'
                      ? o.is_food
                        ? 'Food: must be paid before it arrives'
                        : 'Waiting for payment'
                      : 'Placed'}
              </p>
            </Card>
          </li>
        ))}
      </ul>
      {s.pay_now_count === 0 && (
        <Alert tone="success" className="mt-4">
          Nothing is waiting for payment right now.
        </Alert>
      )}
    </>
  )
}
