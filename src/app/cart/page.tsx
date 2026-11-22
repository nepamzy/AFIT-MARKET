import type { Metadata } from 'next'
import Link from 'next/link'
import { Button, ButtonLink } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/card'
import { Icon } from '@/components/ui/icons'
import { ProductPhoto } from '@/components/ui/product-photo'
import { Money } from '@/components/ui/money'
import { EmptyState } from '@/components/ui/states'
import { describeProblems } from '@/lib/db-errors'
import { clearCartAction, setQuantityAction } from '@/server/modules/cart-and-checkout/actions'
import { canOrderNow } from '@/server/modules/cart-and-checkout/ordering'
import { loadPrincipal } from '@/server/modules/identity-and-access/guard'
import { getMultiQuote } from '@/server/modules/cart-and-checkout/queries'

export const metadata: Metadata = { title: 'Your cart' }

export default async function CartPage() {
  const q = await getMultiQuote({}, null, false)
  if (!q)
    return (
      <EmptyState title="We could not load your cart">Please try again in a moment.</EmptyState>
    )
  if (q.empty)
    return (
      <>
        <PageHeader title="Your cart" />
        <EmptyState
          title="Your cart is empty"
          action={
            <ButtonLink href="/products" variant="gold">
              Browse items
            </ButtonLink>
          }
        >
          Add something from an approved vendor to get started.
        </EmptyState>
      </>
    )
  const who = await loadPrincipal()
  const closed = !(await canOrderNow(who.userId ?? null, who.roles.includes('platform_admin')))
  const warnings = describeProblems(q.problems)
  const allLines = q.groups.flatMap((g) => g.lines)
  const itemCount = allLines.reduce((n, l) => n + l.quantity, 0)
  const itemsTotal = q.groups.reduce((n, g) => n + g.items_total_kobo, 0)
  const qtyForm = (itemId: string, qty: number, label: string, icon: 'plus' | 'minus') => (
    <form action={setQuantityAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="quantity" value={qty} />
      <button
        type="submit"
        aria-label={label}
        disabled={qty < 1 || qty > 20}
        className="touch-target grid size-10 place-items-center rounded-lg border border-line-strong bg-card text-navy-900 hover:bg-brand-50 disabled:opacity-40"
      >
        <Icon name={icon} size={18} />
      </button>
    </form>
  )
  return (
    <>
      <PageHeader
        title="Your cart"
        subtitle={`${q.groups.length} ${q.groups.length === 1 ? 'shop' : 'shops'} · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Cart' }]}
      />
      {warnings.length > 0 && (
        <Alert tone="warning" title="Check your cart" className="mb-4">
          <ul className="list-disc pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {q.groups.map((g) => (
            <section key={g.vendor_id} aria-label={g.vendor_name} className="space-y-3">
              <h2 className="flex flex-wrap items-baseline justify-between gap-2 text-lg font-extrabold text-navy-900">
                <span>{g.vendor_name}</span>
                <span className="text-sm font-bold text-muted">
                  Subtotal <Money kobo={g.items_total_kobo} />
                </span>
              </h2>
              <ul className="space-y-3">
                {g.lines.map((l) => (
                  <li key={l.item_id}>
                    <article className="flex gap-3 rounded-[var(--radius-card)] border border-line bg-card p-3 shadow-[var(--shadow-card)]">
                      <ProductPhoto
                        productId={l.product_id}
                        label={l.name}
                        className="aspect-square! w-20! shrink-0 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-navy-900">{l.name}</p>
                            {l.options.length > 0 && (
                              <p className="text-sm text-muted">
                                {l.options.map((o) => o.name).join(', ')}
                              </p>
                            )}
                            <p className="text-sm text-muted">
                              <Money kobo={l.unit_price_kobo} /> each
                            </p>
                          </div>
                          <Money
                            kobo={l.line_total_kobo}
                            className="text-lg font-extrabold text-navy-900"
                          />
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {qtyForm(
                            l.item_id,
                            l.quantity - 1,
                            `Decrease quantity of ${l.name}`,
                            'minus',
                          )}
                          <span
                            aria-label={`Quantity ${l.quantity}`}
                            className="w-8 text-center font-bold"
                          >
                            {l.quantity}
                          </span>
                          {qtyForm(
                            l.item_id,
                            l.quantity + 1,
                            `Increase quantity of ${l.name}`,
                            'plus',
                          )}
                          <form action={setQuantityAction} className="ml-auto">
                            <input type="hidden" name="itemId" value={l.item_id} />
                            <button
                              type="submit"
                              name="remove"
                              value="1"
                              className="touch-target inline-flex items-center gap-1 px-2 text-sm font-bold text-danger-700 hover:underline"
                            >
                              <Icon name="trash" size={16} /> Remove
                            </button>
                          </form>
                        </div>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <aside className="h-fit space-y-3 rounded-[var(--radius-card)] border border-line bg-card p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-24">
          <h2 className="text-lg font-extrabold text-navy-900">Order summary</h2>
          <p className="flex justify-between">
            <span>Items</span>
            <Money kobo={itemsTotal} className="font-bold" />
          </p>
          <p className="text-sm text-muted">
            Each shop gets its own order. The delivery fee (if you choose delivery) and
            Paystack&apos;s charge are shown in your bill at checkout, before you pay. Prices are
            checked again when you place the order.
          </p>
          {closed ? (
            <Alert tone="warning" title="Awaiting approval from the AFIT board">
              Your cart is saved. Ordering opens as soon as the AFIT board approves, and then you
              can check out here.
            </Alert>
          ) : (
            <ButtonLink href="/checkout" variant="gold" className="w-full">
              Proceed to checkout
            </ButtonLink>
          )}
          <div className="flex items-center justify-between">
            <Link href="/products" className="text-sm font-bold text-brand-700 hover:underline">
              Continue shopping
            </Link>
            <form action={clearCartAction}>
              <Button type="submit" variant="ghost" className="px-2 py-1 text-sm">
                Empty cart
              </Button>
            </form>
          </div>
        </aside>
      </div>
    </>
  )
}
