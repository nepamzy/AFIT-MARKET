import { expect, test } from '@playwright/test'
import {
  admin,
  clickAndWait,
  createUser,
  drawSignature,
  makeShopWithPoint,
  openAnonymous,
  openSession,
  openSessionFor,
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

test('the shop creates a rider account; the rider signs in with the one-time code and is linked to the shop; the code works once; removing the rider ends their access', async ({
  browser,
}, info) => {
  const owner = await createUser('own-rd', ['vendor_owner'])
  await makeShopWithPoint(owner.id, `Fixture dish ${tag()}`)
  const v = await openSessionFor(browser, info, owner)
  await v.page.goto('/vendor/riders')
  await expect(v.page.getByText('one-time')).toBeVisible()
  const email = uniqueEmail('shoprider')
  await v.page.getByLabel('Rider’s name').fill('Musa Bike')
  await v.page.getByLabel('Rider’s e-mail').fill(email)
  await v.page.getByLabel('Rider’s phone').fill('0803 123 4567')
  await clickAndWait(v.page, () =>
    v.page.getByRole('button', { name: 'Create rider account' }).click(),
  )
  const note = await v.page
    .getByRole('status')
    .filter({ hasText: 'temporary password' })
    .innerText()
  const password = /temporary password ([A-Za-z0-9]{12})/.exec(note)![1]!
  const code = /rider code (\d{5})/.exec(note)![1]!
  const card = v.page.getByTestId('vendor-rider').filter({ hasText: 'Musa Bike' })
  await expect(card).toContainText(code)
  await expect(card).toContainText('first sign-in')
  // the same e-mail cannot be used for a second rider
  await v.page.getByLabel('Rider’s name').fill('Second')
  await v.page.getByLabel('Rider’s e-mail').fill(email)
  await v.page.getByLabel('Rider’s phone').fill('0803 123 4568')
  await clickAndWait(v.page, () =>
    v.page.getByRole('button', { name: 'Create rider account' }).click(),
  )
  await expect(
    v.page.getByRole('alert').filter({ hasText: 'already has an account' }),
  ).toBeVisible()

  // the rider signs in: a wrong code is refused, the right one links the account to the shop
  const { context, page } = await openAnonymous(browser, info)
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByTestId('rider-code').locator('summary').click()
  const wrong = code === '12345' ? '54321' : '12345'
  for (let i = 0; i < 5; i++) await page.getByLabel(`Digit ${i + 1} of 5`).fill(wrong[i]!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'does not match this account' }),
  ).toBeVisible()
  expect(
    (await admin().from('vendor_riders').select('claimed_at').eq('code', code).single()).data
      ?.claimed_at,
  ).toBeNull()
  await page.getByLabel('Password').fill(password)
  for (let i = 0; i < 5; i++) await page.getByLabel(`Digit ${i + 1} of 5`).fill(code[i]!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // a new account is asked for a signature once, then lands on the rider area
  await page.waitForURL(/signature-setup/)
  await drawSignature(page)
  await page.getByRole('button', { name: 'Save my signature' }).click()
  await page.goto('/rider')
  await expect(page.getByTestId('shop-link')).toContainText('You are a rider for')
  await context.close()

  // the code cannot be used again, not even by the same account
  const again = await openAnonymous(browser, info)
  await again.page.goto('/login')
  await again.page.getByLabel('Email').fill(email)
  await again.page.getByLabel('Password').fill(password)
  await again.page.getByTestId('rider-code').locator('summary').click()
  for (let i = 0; i < 5; i++) await again.page.getByLabel(`Digit ${i + 1} of 5`).fill(code[i]!)
  await again.page.getByRole('button', { name: 'Sign in' }).click()
  await expect(again.page.getByRole('alert').filter({ hasText: 'already used' })).toBeVisible()
  await again.context.close()

  // the shop sees the rider as linked (the code is no longer shown) and removing them ends their rider access
  await v.page.reload()
  await expect(v.page.getByTestId('vendor-rider').filter({ hasText: 'Musa Bike' })).toContainText(
    'Linked',
  )
  await clickAndWait(v.page, () =>
    v.page.getByRole('button', { name: 'Remove rider' }).first().click(),
  )
  await expect(v.page.getByText('Musa Bike')).toHaveCount(0)
  const uid = (
    await admin().from('vendor_riders').select('rider_user_id').eq('code', code).single()
  ).data!.rider_user_id as string
  const roles = await admin()
    .from('role_assignments')
    .select('status')
    .eq('user_id', uid)
    .eq('role', 'rider')
  expect(roles.data?.every((r) => r.status === 'revoked')).toBe(true)
  await v.context.close()
})
