import { expect, test } from '@playwright/test'
import { PASSWORD, registerViaUi, unique, verifyViaEmail } from './helpers'

test.describe('sign-up, verification and welcome', () => {
  test('a new account verifies by email, sees the welcome once, and skips it when returning', async ({
    page,
  }) => {
    const { email } = await registerViaUi(page, 'welcome')
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()

    await verifyViaEmail(page, email)
    await expect(page).toHaveURL(/\/welcome/)
    await expect(page.getByRole('heading', { name: /Welcome to NOVR Events/ })).toBeVisible()

    // Choosing a destination records completion and navigates.
    await page.getByRole('button', { name: /Explore events/ }).click()
    await expect(page).toHaveURL(/\/events/)

    // Returning: signing out and back in lands on the normal page, not the welcome.
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/')

    await page.goto('/login', { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard/)

    await page.goto('/welcome', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('skipping the welcome also records completion', async ({ page }) => {
    const { email } = await registerViaUi(page, 'skip')
    await verifyViaEmail(page, email)
    await expect(page).toHaveURL(/\/welcome/)
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    await page.goto('/welcome', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('the welcome is not shown to people who are signed out', async ({ page }) => {
    await page.goto('/welcome', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/login\?next=%2Fwelcome/)
  })
})

test.describe('terms consent', () => {
  test('the consent box starts unticked and sign-up refuses without it', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'networkidle' })
    const box = page.getByLabel(/I agree to the/)
    await expect(box).not.toBeChecked()

    const username = unique('noterms').slice(0, 28)
    await page.getByLabel('Full name').fill('No Terms')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Email').fill(`${username}@example.test`)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(
      page.getByText('Tick the box to agree to the Terms of use and Privacy policy.'),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/register/)
  })

  test('the username is suggested from the name and stays editable', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'networkidle' })
    await page.getByLabel('Full name').fill('Tunde Bakaré')
    await expect(page.getByLabel('Username')).toHaveValue('tunde-bakare')
    await page.getByLabel('Username').fill('my-own-name')
    await page.getByLabel('Full name').fill('Tunde Bakaré Jr')
    await expect(page.getByLabel('Username')).toHaveValue('my-own-name')
  })
})

test.describe('expired verification links', () => {
  test('an invalid link offers a new one without signing in', async ({ page, context }) => {
    await page.goto('/verify-email?token=this-link-was-never-issued-0123456789', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'This link can’t be used' })).toBeVisible()

    // Signed out: the recovery form still works.
    await context.clearCookies()
    await page.getByLabel('Email').fill('nobody-at-all@example.test')
    await page.getByRole('button', { name: 'Send a new verification link' }).click()
    // The same reply whether or not the address has an unverified account.
    const settings = await (await page.request.get('/api/v1/auth/providers')).json()
    await expect(page.getByRole('status').filter({ hasText: settings.emailDelivery ? 'Check your inbox' : 'Request recorded' })).toBeVisible()
  })
})
