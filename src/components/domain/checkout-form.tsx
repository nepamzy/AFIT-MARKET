'use client'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Icon } from '@/components/ui/icons'
import { Input, Select } from '@/components/ui/fields'
import { Money } from '@/components/ui/money'
import {
  placeOrdersAction,
  quoteCheckoutAction,
  type CheckoutState,
} from '@/server/modules/cart-and-checkout/actions'
import type { DeliveryPoint, MultiQuote } from '@/server/modules/cart-and-checkout/queries'

type Choice = 'pickup' | 'delivery'

/**
 * Checkout for a cart with items from one or more shops. Each shop gets its own pickup or delivery choice and becomes its own
 * order, so the money goes to that shop. The bill (items, Paystack's charge, total) is worked out by the database again each
 * time a choice changes, so the number shown is the number Paystack will ask for.
 */
export function CheckoutForm({
  initial,
  deliveryAvailable,
  points,
  defaultPoint,
  idempotencyKey,
  closed = false,
}: {
  initial: MultiQuote
  deliveryAvailable: boolean
  points: DeliveryPoint[]
  defaultPoint?: string
  idempotencyKey: string
  /** Ordering is not open yet (waiting for the AFIT board): the order button is switched off. */
  closed?: boolean
}) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrdersAction, {})
  const [q, setQ] = useState<MultiQuote>(initial)
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [point, setPoint] = useState<string | null>(defaultPoint ?? points[0]?.id ?? null)
  const [, startTransition] = useTransition()
  const seq = useRef(0)

  const choiceOf = (id: string): Choice => choices[id] ?? 'pickup'
  const anyDelivery = q.groups.some((g) => choiceOf(g.vendor_id) === 'delivery')

  // ask the database for the bill again whenever a choice changes
  useEffect(() => {
    const mine = ++seq.current
    startTransition(async () => {
      const next = await quoteCheckoutAction(choices, point, true)
      if (next && mine === seq.current) setQ(next)
    })
  }, [choices, point])

  const doorGroups = q.groups.filter((g) => g.pay_timing === 'door')
  const nowGroups = q.groups.filter((g) => g.pay_timing === 'now')
  const foodNow = nowGroups.filter((g) => g.is_food)
  const anyDoor = doorGroups.length > 0
  const optionCls = (on: boolean, disabled = false) =>
    `touch-target flex items-start gap-3 rounded-[var(--radius-card)] border-2 p-4 ${disabled ? 'cursor-not-allowed border-line text-muted' : on ? 'cursor-pointer border-navy-900 bg-brand-50' : 'cursor-pointer border-line bg-card hover:border-line-strong'}`

  return (
    <form
      action={action}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
    >
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="space-y-5">
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {q.groups.length > 1 && (
          <Alert tone="info" title={`${q.groups.length} shops, ${q.groups.length} orders`}>
            Each shop gets its own order, so each shop is paid for its own items. You can pay for
            all of them together in one go.
          </Alert>
        )}
        <h2 className="text-lg font-extrabold text-navy-900">1. How do you want to get it?</h2>
        {q.groups.map((g) => {
          const mode = choiceOf(g.vendor_id)
          return (
            <fieldset key={g.vendor_id} className="space-y-2">
              <legend className="mb-1 font-bold text-navy-900">
                {g.vendor_name}
                {g.is_food && <span className="ml-2 text-sm font-normal text-muted">(food)</span>}
              </legend>
              <label className={optionCls(mode === 'pickup')}>
                <input
                  type="radio"
                  name={`fulfilment-${g.vendor_id}`}
                  value="pickup"
                  checked={mode === 'pickup'}
                  onChange={() => setChoices((c) => ({ ...c, [g.vendor_id]: 'pickup' }))}
                  className="mt-1 size-5 accent-[var(--color-brand-700)]"
                />
                <span>
                  <span className="flex items-center gap-2 font-bold text-navy-900">
                    <Icon name="store" size={18} /> Pickup{' '}
                    <span className="font-normal text-muted">(free)</span>
                  </span>
                  <span className="block text-sm text-muted">
                    Collect from {g.vendor_name} with a pickup code.
                  </span>
                </span>
              </label>
              <label
                className={optionCls(
                  mode === 'delivery',
                  !deliveryAvailable || g.rider_available === false,
                )}
              >
                <input
                  type="radio"
                  name={`fulfilment-${g.vendor_id}`}
                  value="delivery"
                  disabled={!deliveryAvailable || g.rider_available === false}
                  checked={mode === 'delivery'}
                  onChange={() => setChoices((c) => ({ ...c, [g.vendor_id]: 'delivery' }))}
                  className="mt-1 size-5 accent-[var(--color-brand-700)]"
                />
                <span>
                  <span className="flex items-center gap-2 font-bold text-navy-900">
                    <Icon name="truck" size={18} /> Delivery
                  </span>
                  <span className="block text-sm text-muted">
                    {g.rider_available === false
                      ? 'This shop has no delivery rider yet, so only pickup is possible.'
                      : deliveryAvailable
                        ? 'A rider from this shop brings it to an approved delivery point.'
                        : 'No delivery points are open yet.'}
                  </span>
                </span>
              </label>
            </fieldset>
          )
        })}
        {anyDelivery && (
          <Input
            label="What are you wearing? (optional)"
            name="clothing"
            maxLength={120}
            hint="Your rider sees this when they arrive, so they can find you. For example: a black shirt and blue jeans. Your rider can also see your phone number to call you."
          />
        )}
        {anyDelivery && (
          <Select
            label="Delivery point"
            name="point"
            required
            value={point ?? ''}
            onChange={(e) => setPoint(e.target.value)}
            hint="Delivery goes only to approved points."
          >
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        )}
        {q.door_enabled && (
          <Alert tone="info" title="When you pay">
            {doorGroups.length > 0 && (
              <span className="block">
                Orders from shops that do not sell food are paid{' '}
                <strong>when you receive them</strong>. The shop prepares your order now, and you
                pay with Paystack on your phone when you see it. The rider or shop waits for your
                payment before you confirm.
              </span>
            )}
            {foodNow.length > 0 && (
              <span className="block">
                {foodNow.map((g) => g.vendor_name).join(', ')} sells food, so that order is paid{' '}
                <strong>now</strong>, before it is made. It is included in the total you pay now.
              </span>
            )}
          </Alert>
        )}
        <p className="rounded-[var(--radius-control)] bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <Icon name="lock" size={14} className="mr-1 inline" />
          Payments go through Paystack. Paystack adds a small charge, shown in your bill before you
          pay.
        </p>
      </div>
      <aside
        className="h-fit space-y-3 rounded-[var(--radius-card)] border border-line bg-card p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-24"
        aria-labelledby="summary"
      >
        <h2 id="summary" className="text-lg font-extrabold text-navy-900">
          Your bill
        </h2>
        {q.groups.map((g) => (
          <div key={g.vendor_id} className="space-y-1 text-sm">
            <p className="font-bold text-navy-900">
              {g.vendor_name}{' '}
              <span className="font-normal text-muted">
                {g.pay_timing === 'door'
                  ? '· pay when you receive it'
                  : g.is_food
                    ? '· food: pay before arrival'
                    : '· pay now'}
              </span>
            </p>
            <ul className="space-y-0.5">
              {g.lines.map((l) => (
                <li key={l.item_id} className="flex justify-between gap-2">
                  <span>
                    {l.quantity} × {l.name}
                    {l.options.length ? ` (${l.options.map((o) => o.name).join(', ')})` : ''}
                  </span>
                  <Money kobo={l.line_total_kobo} />
                </li>
              ))}
              {g.delivery_fee_kobo > 0 && (
                <li className="flex justify-between gap-2">
                  <span>
                    Delivery
                    {g.delivery_fee_collection === 'direct_to_rider' &&
                      ' (paid to your rider after delivery)'}
                  </span>
                  <Money kobo={g.delivery_fee_kobo} />
                </li>
              )}
            </ul>
          </div>
        ))}
        <hr className="border-line" />
        {q.pay_now_items_kobo > 0 && (
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt>{anyDoor ? 'To pay now' : 'Items'}</dt>
              <dd>
                <Money kobo={q.pay_now_items_kobo} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Paystack charge</dt>
              <dd>
                <Money kobo={q.pay_now_charge_kobo} />
              </dd>
            </div>
            <div className="flex justify-between text-lg font-extrabold text-navy-900">
              <dt>Checkout total</dt>
              <dd data-testid="checkout-total">
                <Money kobo={q.pay_now_total_kobo} />
              </dd>
            </div>
          </dl>
        )}
        {anyDoor && (
          <div className="space-y-1 rounded-[var(--radius-control)] bg-brand-50 p-3 text-sm">
            <p className="font-bold text-navy-900">Pay when you receive it</p>
            {doorGroups.map((g) => (
              <p key={g.vendor_id} className="flex justify-between gap-2">
                <span>{g.vendor_name}</span>
                <span>
                  <Money kobo={g.total_kobo} /> + <Money kobo={g.door_charge_kobo} /> Paystack
                  charge
                </span>
              </p>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">
          The database works out these numbers again when you place the order.
        </p>
        {closed && (
          <Alert tone="warning" title="Ordering opens soon">
            AFIT Market is awaiting approval from the AFIT board. Your cart is saved, and you can
            order as soon as it is approved.
          </Alert>
        )}
        <Button type="submit" variant="gold" disabled={pending || closed} className="w-full">
          {pending
            ? 'Placing order…'
            : q.groups.length > 1
              ? `Place ${q.groups.length} orders`
              : anyDoor
                ? 'Place order, pay later'
                : 'Place order'}
        </Button>
      </aside>
    </form>
  )
}
