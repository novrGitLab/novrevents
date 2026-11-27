import { expect, test, type Page } from '@playwright/test'

/** Phase 2C: the personal dashboard, saved events, profile preview and the registration confirmation. */
const ATTENDEE = 'attendee@novr-demo.example.test'
const PASSWORD = 'NovrDemo-2026!'
const SUMMIT_TITLE = 'Cybernovr Security Summit 2026'

async function signInAsAttendee(page: Page) {
  await page.goto('/login?next=%2Fdashboard', { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(ATTENDEE)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test.describe('personal dashboard', () => {
  test.beforeAll(async ({ request }) => {
    const response = await request.get('/api/v1/public/events/cybernovr-security-summit-2026')
    test.skip(!response.ok(), 'Demo data is not loaded (run npm run db:seed:demo in novrevents-backend).')
  })

  test('the overview shows saved events, the following list and the profile card', async ({ page }) => {
    await signInAsAttendee(page)
    await expect(page.getByRole('heading', { name: 'Saved events' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Following' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tunde Bakare' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit profile' })).toHaveAttribute(
      'href',
      '/dashboard/profile',
    )
    await expect(page.getByRole('link', { name: 'Preview public profile' })).toBeVisible()
  })

  test('save and unsave round-trip through the saved events page', async ({ page }) => {
    await signInAsAttendee(page)
    await page.goto('/events/cybernovr-security-summit-2026', { waitUntil: 'networkidle' })

    // Start from unsaved, whatever an earlier run left behind.
    const save = page.getByRole('button', { name: /^(Save|Saved)$/ }).first()
    if ((await save.textContent())?.trim() === 'Saved') {
      await save.click()
      await expect(page.getByRole('button', { name: 'Save', exact: true }).first()).toBeVisible()
    }
    await page.getByRole('button', { name: 'Save', exact: true }).first().click()
    await expect(page.getByRole('button', { name: 'Saved', exact: true }).first()).toBeVisible()

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: 'Saved', exact: true }).first()).toBeVisible()

    await page.goto('/dashboard/saved', { waitUntil: 'networkidle' })
    await expect(page.getByRole('link', { name: SUMMIT_TITLE, exact: true }).first()).toBeVisible()
    await page
      .getByRole('button', { name: `Remove ${SUMMIT_TITLE} from saved events` })
      .first()
      .click()
    await expect(page.getByRole('button', { name: `Remove ${SUMMIT_TITLE} from saved events` })).toHaveCount(
      0,
    )
  })

  test('the profile page previews what visitors see', async ({ page }) => {
    await signInAsAttendee(page)
    await page.goto('/dashboard/profile', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Public preview' })).toBeVisible()
    await expect(page.getByText('This is what visitors see on your profile.')).toBeVisible()
    await expect(page.getByRole('link', { name: /View public profile/ })).toHaveAttribute(
      'href',
      /\/u\/tunde-bakare/,
    )
  })
})

test.describe('registration confirmation', () => {
  test('a confirmed guest registration offers a working calendar file', async ({ page, request }) => {
    await page.goto('/f/register-for-the-summit', { waitUntil: 'networkidle' })
    const email = `calendar-${Date.now().toString(36)}@attendee.example.test`
    await page.getByLabel('Full name').fill('Calendar Check')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Which best describes your role?').selectOption({ label: 'SOC analyst' })
    await page.getByRole('button', { name: 'Register' }).click()

    const calendar = page.getByRole('link', { name: 'Add to calendar' })
    await expect(calendar).toBeVisible()
    const href = await calendar.getAttribute('href')
    expect(href).toBe('/api/v1/public/events/cybernovr-security-summit-2026/calendar.ics')

    const file = await request.get(href ?? '')
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toContain('text/calendar')
    expect(await file.text()).toContain('BEGIN:VCALENDAR')
  })
})
