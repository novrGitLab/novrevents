import { expect, test, type Page } from '@playwright/test'

/** Demo organisation seeded by `npm run db:seed:demo`. The tests skip when the demo data is not loaded. */
const ORG_PATH = '/o/cybernovr'
const ATTENDEE = 'attendee@novr-demo.example.test'
const PASSWORD = 'NovrDemo-2026!'

async function signInAsAttendee(page: Page) {
  await page.goto('/login?next=%2Fo%2Fcybernovr', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Use a password instead' }).click()
  await page.getByLabel('Email or username').fill(ATTENDEE)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/o\/cybernovr/)
}

test.describe('organisation following', () => {
  test.beforeAll(async ({ request }) => {
    const response = await request.get('/api/v1/public/organizations/cybernovr')
    test.skip(!response.ok(), 'Demo data is not loaded (run npm run db:seed:demo in novrevents-backend).')
  })

  test('visitors are asked to sign in and return to the organisation', async ({ page }) => {
    await page.goto(ORG_PATH, { waitUntil: 'networkidle' })
    const prompt = page.getByRole('link', { name: 'Sign in to follow' })
    await expect(prompt).toBeVisible()
    await prompt.click()
    await expect(page).toHaveURL(/\/login\?next=%2Fo%2Fcybernovr/)
  })

  test('a signed-in person follows, sees it persist, lists it, and stops following', async ({ page }) => {
    await signInAsAttendee(page)
    await page.goto(ORG_PATH, { waitUntil: 'networkidle' })

    // Start from a known state, whatever a previous run left behind.
    const current = page.getByRole('button', { name: /^(Follow|Following)$/ })
    await expect(current).toBeVisible()
    if ((await current.textContent())?.trim() === 'Following') {
      await current.click()
      await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible()
    }

    await page.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Following', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: 'Following', exact: true })).toBeVisible()

    await page.goto('/dashboard/following', { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'Organisations' }).click()
    await expect(page.getByRole('tabpanel')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cybernovr', exact: true })).toBeVisible()

    // Stop following from the list, then confirm on the organisation page.
    await page.getByRole('button', { name: 'Stop following Cybernovr' }).click()
    await expect(page.getByRole('link', { name: 'Cybernovr', exact: true })).toHaveCount(0)
    await page.goto(ORG_PATH, { waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible()
  })
})

test.describe('discovery', () => {
  test('the homepage makes no featured or closing-soon claims', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { level: 1, name: /The art of\s*going out\./i })).toBeVisible()
    await expect(page.getByText(/featured|closing soon/i)).toHaveCount(0)
  })

  test('Explore switches between grid and list, keeps filters in the URL, and resets them', async ({
    page,
  }) => {
    await page.goto('/explore', { waitUntil: 'networkidle' })
    await expect(page.getByText(/\d+ events?/)).toBeVisible()

    await page.getByRole('button', { name: 'List view' }).click()
    await expect(page).toHaveURL(/view=list/)
    await expect(page.getByRole('list', { name: 'Events' })).toBeVisible()

    await page.getByRole('button', { name: 'Grid view' }).click()
    await expect(page).not.toHaveURL(/view=list/)

    await page.goto('/explore?mode=VIRTUAL', { waitUntil: 'networkidle' })
    await expect(page.getByLabel('Format')).toHaveValue('VIRTUAL')
    await page.getByRole('button', { name: 'Clear all', exact: true }).click()
    await expect(page).toHaveURL(/\/events$/)
    await expect(page.getByLabel('Format')).toHaveValue('')
  })

  test('the Explore search narrows results by title', async ({ page }) => {
    await page.goto('/explore?q=summit', { waitUntil: 'networkidle' })
    await expect(page.getByText(/\d+ events?/)).toBeVisible()
    await expect(page.getByRole('link', { name: /Cybernovr Security Summit 2026/ }).first()).toBeVisible()
  })
})
