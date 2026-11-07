import { expect, test } from '@playwright/test'
import { idCardJpeg } from '../fixtures/id-card'
import {
  PASSWORD,
  admin,
  clickAndWait,
  createUser,
  drawSignature,
  makeShopWithPoint,
  openAnonymous,
  openSession,
  openSessionFor,
  seedRider,
  tag,
  uniqueEmail,
} from './helpers'

import type { Page } from '@playwright/test'
const autoSave = (p: Page) =>
  p
    .getByRole('region')
    .filter({ has: p.getByRole('heading', { name: 'Automatic ready', level: 2 }) })
    .getByRole('button', { name: 'Save' })

test('onboarding explains automatic ready; the choice follows the application to the approved shop and can be changed', async ({
  browser,
}, info) => {
  const t = tag()
  const shop = `Auto Spot ${t}`
  const a = await openSession(browser, info, 'autoapp')
  await a.page.goto('/apply')
  // the explanation is on the form, with the 12:00 -> 1:00 pm example
  await expect(a.page.getByText('Automatic ready (optional)')).toBeVisible()
  await expect(a.page.getByText(/paid at 12:00 pm and you chose 1 hour/)).toBeVisible()
  await expect(a.page.getByText(/accept or decline/i).first()).toBeVisible()
  await a.page.getByLabel('Business name').fill(shop)
  const choices = a.page.getByTestId('vendor-choices')
  await choices.getByRole('radio', { name: /^Other/ }).check()
  await choices.getByLabel('Food', { exact: true }).check()
  await a.page.getByLabel('Contact phone').fill('08012345678')
  await a.page
    .getByLabel('What do you sell?')
    .fill('Jollof rice and sides for the campus community')
  await a.page
    .getByLabel('Where will customers collect orders?')
    .fill('Sample pickup bench (placeholder)')
  await a.page.getByLabel('Mark my orders ready automatically').check()
  await a.page.getByLabel('Ready after').selectOption('60')
  await a.page.getByLabel(/I agree to follow/).check()
  await clickAndWait(a.page, () =>
    a.page.getByRole('button', { name: 'Submit application' }).click(),
  )
  await expect(
    a.page.getByText(`Your application for “${shop}” is waiting for review.`),
  ).toBeVisible()
  const app = await admin()
    .from('vendor_applications')
    .select('auto_ready_enabled, auto_ready_minutes')
    .eq('business_name', shop)
    .single()
  expect(app.data).toEqual({ auto_ready_enabled: true, auto_ready_minutes: 60 })

  const adm = await openSession(browser, info, 'autoadm', ['platform_admin'])
  await adm.page.goto('/admin/applications')
  const card = adm.page.getByTestId('pending-application').filter({ hasText: shop })
  await card.getByRole('button', { name: 'Approve' }).click()
  await expect
    .poll(
      async () =>
        (
          await admin()
            .from('vendors')
            .select('auto_ready_enabled, auto_ready_minutes')
            .eq('name', shop)
            .maybeSingle()
        ).data,
    )
    .toEqual({ auto_ready_enabled: true, auto_ready_minutes: 60 })

  // the owner changes it in Shop settings
  await a.page.reload()
  await a.page.goto('/vendor/profile')
  await expect(a.page.getByLabel('Ready after')).toHaveValue('60')
  await a.page.getByLabel('Ready after').selectOption('120')
  await clickAndWait(a.page, () => autoSave(a.page).click())
  await expect
    .poll(
      async () =>
        (await admin().from('vendors').select('auto_ready_minutes').eq('name', shop).single()).data
          ?.auto_ready_minutes,
    )
    .toBe(120)
  await a.page.reload()
  await a.page.getByLabel('Mark my orders ready automatically').uncheck()
  await clickAndWait(a.page, () => autoSave(a.page).click())
  await expect
    .poll(
      async () =>
        (await admin().from('vendors').select('auto_ready_enabled').eq('name', shop).single()).data
          ?.auto_ready_enabled,
    )
    .toBe(false)
  await Promise.all([a.context.close(), adm.context.close()])
})

test('a shop adds its own rider and gets a 5-digit code; the rider enters it while signing up and the dashboard shows the link; the shop can remove them', async ({
  browser,
}, info) => {
  const owner = await createUser('own-rd', ['vendor_owner'])
  const shop = await makeShopWithPoint(owner.id, `Fixture dish ${tag()}`)
  const v = await openSessionFor(browser, info, owner)
  await v.page.goto('/vendor/riders')
  await expect(v.page.getByText('permanent 5-digit code')).toBeVisible()
  await v.page.getByLabel('Rider’s name').fill('Musa Bike')
  await clickAndWait(v.page, () => v.page.getByRole('button', { name: 'Add rider' }).click())
  const card = v.page.getByTestId('vendor-rider').filter({ hasText: 'Musa Bike' })
  await expect(card).toBeVisible()
  const code = (await card.locator('strong').first().innerText()).trim()
  expect(code).toMatch(/^[0-9]{5}$/)
  await expect(card).toContainText('Waiting for the rider')

  // a wrong code is refused at sign-up; the right one links the new rider account
  const { context, page } = await openAnonymous(browser, info)
  const email = uniqueEmail('shoprider')
  await page.goto('/signup')
  await page
    .getByRole('group', { name: 'I want to use AFIT Market as a' })
    .getByRole('radio', { name: /Rider/ })
    .check()
  await page.getByLabel('Matric number').fill('AFIT/2026/0888')
  await page.getByLabel('Phone number').fill('0803 123 4567')
  await page.locator('#rider-id-front').setInputFiles({
    name: 'front.jpg',
    mimeType: 'image/jpeg',
    buffer: await idCardJpeg('front-with-qr'),
  })
  await expect(page.getByText('QR code found on the front of your card.')).toBeVisible()
  await page
    .locator('#rider-id-back')
    .setInputFiles({ name: 'back.jpg', mimeType: 'image/jpeg', buffer: await idCardJpeg('back') })
  const boxes = page.getByTestId('shop-code')
  await expect(boxes).toContainText('Shop code (optional)')
  // paste the code into the first box: it spreads over all five
  await boxes.getByLabel('Digit 1 of 5').focus()
  const wrong = code === '12345' ? '54321' : '12345'
  for (let i = 0; i < 5; i++) await boxes.getByLabel(`Digit ${i + 1} of 5`).fill(wrong[i]!)
  await page.getByRole('button', { name: 'Next' }).click()
  await drawSignature(page)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByLabel(/I confirm that I am 18/).check()
  await clickAndWait(page, () => page.getByRole('button', { name: 'Create account' }).click())
  await expect(page.getByText(/shop code was not found/i)).toBeVisible()
  // back to the first step, correct the digits
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  for (let i = 0; i < 5; i++) await boxes.getByLabel(`Digit ${i + 1} of 5`).fill(code[i]!)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByLabel(/I confirm that I am 18/).check()
  await clickAndWait(page, () => page.getByRole('button', { name: 'Create account' }).click())
  await expect
    .poll(
      async () =>
        (
          await admin()
            .from('vendor_riders')
            .select('rider_user_id, claimed_at')
            .eq('code', code)
            .single()
        ).data?.rider_user_id,
    )
    .not.toBeNull()
  await context.close()

  await v.page.reload()
  await expect(v.page.getByTestId('vendor-rider').filter({ hasText: 'Musa Bike' })).toContainText(
    'Linked',
  )
  expect(shop.vendorId).toBeTruthy()
  // removing the rider frees them
  await clickAndWait(v.page, () => v.page.getByRole('button', { name: 'Remove rider' }).click())
  await expect(v.page.getByText('Musa Bike')).toHaveCount(0)
  await v.context.close()
})

test('a rider with an account types a shop code on their home page; the home page then says which shop they ride for', async ({
  browser,
}, info) => {
  const owner = await createUser('own-rd2', ['vendor_owner'])
  const shop = await makeShopWithPoint(owner.id, `Fixture dish ${tag()}`)
  const code = (
    await (
      await import('./helpers')
    )
      .admin()
      .rpc('vendor_rider_create', { p_vendor: shop.vendorId, p_name: 'Late Rider' })
  ).data
  expect(code).toBeNull() // the function needs a signed-in shop owner: the service role cannot call it for them
  const v = await openSessionFor(browser, info, owner)
  await v.page.goto('/vendor/riders')
  await v.page.getByLabel('Rider’s name').fill('Late Rider')
  await clickAndWait(v.page, () => v.page.getByRole('button', { name: 'Add rider' }).click())
  const digits = (
    await v.page.getByTestId('vendor-rider').first().locator('strong').first().innerText()
  ).trim()
  const rider = await seedRider({ active: false })
  const r = await openSessionFor(browser, info, rider)
  await r.page.goto('/rider')
  await expect(r.page.getByTestId('shop-link')).toContainText('Did a shop give you a rider code?')
  for (let i = 0; i < 5; i++) await r.page.getByLabel(`Digit ${i + 1} of 5`).fill(digits[i]!)
  await clickAndWait(r.page, () => r.page.getByRole('button', { name: 'Link to the shop' }).click())
  await r.page.reload()
  await expect(r.page.getByTestId('shop-link')).toContainText('You are a rider for')
  await Promise.all([v.context.close(), r.context.close()])
})
