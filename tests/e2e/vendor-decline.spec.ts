import { expect, test } from '@playwright/test'
import {
  admin,
  clickAndWait,
  createUser,
  makeShopWithPoint,
  openSessionFor,
  openSession,
  tag,
} from './helpers'

// Paystack (the local fake) confirms payment, so the shop only accepts or declines. A declined order is refunded automatically.

async function paidOrder(shop: { vendorId: string }, customerId: string) {
  const a = admin()
  const { data: o, error } = await a
    .from('orders')
    .insert({
      order_number: `AFM-T${tag()}`,
      customer_id: customerId,
      vendor_id: shop.vendorId,
      vendor_name: 'Fixture shop',
      fulfilment: 'pickup',
      pickup_location_snapshot: 'Counter (placeholder)',
      status: 'PAID',
      items_total_kobo: 300000,
      delivery_fee_kobo: 0,
      platform_fee_kobo: 0,
      total_kobo: 300000,
      idempotency_key: `fixture-${tag()}-decline-key`,
    })
    .select('id, order_number')
    .single()
  if (error) throw error
  await a.from('order_items').insert({
    order_id: o!.id,
    product_name: 'Jollof rice (fixture)',
    base_price_kobo: 150000,
    unit_price_kobo: 150000,
    quantity: 2,
    line_total_kobo: 300000,
  })
  const { data: t, error: te } = await a
    .from('payment_transactions')
    .insert({
      order_id: o!.id,
      reference: `AFM-REF-${tag()}${tag()}`,
      amount_kobo: 300000,
      status: 'succeeded',
      succeeded_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (te) throw te
  await a.from('ledger_entries').insert({
    order_id: o!.id,
    transaction_id: t!.id,
    entry_type: 'payment_received',
    amount_kobo: 300000,
  })
  return { id: o!.id as string, number: o!.order_number as string }
}

test('the shop only accepts or declines; payment shows as confirmed; accepting starts preparing', async ({
  browser,
}, info) => {
  const owner = await createUser('dec-own', ['vendor_owner'])
  const shop = await makeShopWithPoint(owner.id, `Fixture dish ${tag()}`)
  const cust = await createUser('dec-cust')
  const o = await paidOrder(shop, cust.id)
  const v = await openSessionFor(browser, info, owner)
  await v.page.goto('/vendor/orders')
  await expect(v.page.getByText('✓ Payment confirmed').first()).toBeVisible()
  await expect(v.page.getByRole('button', { name: 'Accept order' })).toBeVisible()
  await expect(v.page.getByRole('button', { name: 'Decline order' })).toBeVisible()
  await expect(v.page.getByRole('button', { name: /Start preparing|Confirm payment/ })).toHaveCount(
    0,
  )
  await clickAndWait(v.page, () => v.page.getByRole('button', { name: 'Accept order' }).click())
  await expect
    .poll(
      async () =>
        (await admin().from('orders').select('status').eq('id', o.id).single()).data?.status,
    )
    .toBe('PREPARING')
  await v.page.goto('/vendor/orders')
  await expect(v.page.getByRole('button', { name: 'Mark ready' })).toBeVisible()
  await v.context.close()
})

test('declining needs a reason, tells the customer why, and refunds the payment automatically', async ({
  browser,
}, info) => {
  const owner = await createUser('dec2-own', ['vendor_owner'])
  const shop = await makeShopWithPoint(owner.id, `Fixture dish ${tag()}`)
  const c = await openSession(browser, info, 'dec2-cust')
  const o = await paidOrder(shop, c.user.id)
  const v = await openSessionFor(browser, info, owner)
  await v.page.goto('/vendor/orders')
  // no reason: nothing happens
  await v.page.getByRole('button', { name: 'Decline order' }).click()
  expect((await admin().from('orders').select('status').eq('id', o.id).single()).data?.status).toBe(
    'PAID',
  )
  await v.page.getByLabel(/Reason/).fill('Sold out today')
  await clickAndWait(v.page, () => v.page.getByRole('button', { name: 'Decline order' }).click())
  await expect
    .poll(
      async () =>
        (await admin().from('orders').select('status').eq('id', o.id).single()).data?.status,
    )
    .toBe('CANCELLED')
  // the refund is started right away and (in the local Paystack) finishes at once
  await expect
    .poll(
      async () =>
        (
          await admin()
            .from('refunds')
            .select('status, source, amount_kobo, provider_mode')
            .eq('order_id', o.id)
        ).data?.[0],
      { timeout: 20_000 },
    )
    .toMatchObject({
      source: 'auto',
      status: 'succeeded',
      amount_kobo: 300000,
      provider_mode: 'paystack_test',
    })
  const paid = await admin()
    .from('ledger_entries')
    .select('amount_kobo')
    .eq('order_id', o.id)
    .eq('entry_type', 'refund_paid')
  expect(paid.data).toHaveLength(1)
  // the customer sees the decision, the reason and the refund
  await c.page.goto(`/orders/${o.id}`)
  const box = c.page.getByTestId('declined')
  await expect(box).toContainText('The shop declined this order')
  await expect(box).toContainText('Sold out today')
  await expect(box).toContainText('has been refunded')
  await v.context.close()
  await c.context.close()
})
