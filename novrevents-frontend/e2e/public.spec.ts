import { expect, test } from '@playwright/test'
import { PASSWORD, registerViaUi, verifyViaEmail } from './helpers'

test.describe('public site', () => {
  test('home and explore load real data and filters work @mobile', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /Find your\s*people\./i,
    )
    await page.getByRole('main').getByRole('link', { name: 'Browse all events' }).first().click()
    await expect(page).toHaveURL(/\/events/)
    await page.getByRole('searchbox', { name: 'Search events', exact: true }).fill('summit')
    await page.getByRole('searchbox', {name:'Search events'}).press('Enter')
    await expect(page).toHaveURL(/q=summit/)
    await expect(page.getByRole('heading', { level: 1, name: /Discover events/i })).toBeVisible()
    // The result count comes from the API and is always rendered.
    await expect(page.getByText(/\d+ events?/)).toBeVisible()
  })

  test('legal pages are reachable from the footer', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy policy' }).click()
    await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible()
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: 'Terms of use' })).toBeVisible()
  })

  test('unknown forms and events show a clear not-found state', async ({ page }) => {
    await page.goto('/f/does-not-exist-xyz')
    await expect(page.getByRole('heading', { name: 'Form not found' })).toBeVisible()
    await page.goto('/events/does-not-exist-xyz')
    await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible()
  })
})

test.describe('accounts', () => {
  test('register, verify, sign out and sign back in', async ({ page }) => {
    const { email, username } = await registerViaUi(page)
    await verifyViaEmail(page, email)
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page).toHaveURL(/\/dashboard/)

    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/')

    await page.goto('/login', { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('wrong-password-123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Incorrect sign-in details.')).toBeVisible()

    await page.getByLabel('Email or username').fill(username)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('signed-in areas redirect anonymous visitors to sign in', async ({ page }) => {
    await page.goto('/dashboard/events')
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fevents/)
  })
})

test.describe('organiser flow', () => {
  test('create a draft event and a guest-accessible form', async ({ page, browser }) => {
    await registerViaUi(page, 'org')

    await page.goto('/dashboard/events/new', { waitUntil: 'networkidle' })
    await page.getByLabel('Title').fill('E2E Detection Engineering Day')
    await page.getByLabel(/^Starts/).fill('2031-05-10T09:00')
    await page.getByLabel(/^Ends/).fill('2031-05-10T17:00')
    await page.getByRole('button', { name: 'Create draft' }).click()
    await expect(page.getByRole('heading', { name: 'E2E Detection Engineering Day' })).toBeVisible()
    await expect(page.getByText('Draft', { exact: true })).toBeVisible()

    // A standalone general form: build, then try to publish (needs a verified email).
    await page.goto('/dashboard/forms', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'New form' }).click()
    await page.getByLabel('Title').fill('E2E Feedback')
    await page.getByRole('button', { name: 'Create and open builder' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Feedback' })).toBeVisible()
    // The builder opens on the three-panel Build view with a live preview.
    await expect(page.getByRole('heading', { name: 'Live preview' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Question properties' })).toBeVisible()
    await page.getByRole('tab', { name: /Limits/ }).click()
    await expect(page.getByLabel('Response limit')).toBeVisible()

    // Anonymous visitors cannot see the unpublished form's builder.
    const guest = await browser.newPage()
    await guest.goto(page.url())
    await expect(guest).toHaveURL(/\/login/)
    await guest.close()
  })
})
