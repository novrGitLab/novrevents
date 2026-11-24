import { expect, test, type Page } from '@playwright/test'

/** Phase 2D: the organiser's attendee drawer on the registrations page, with real demo data. */
const ORGANIZER = 'organizer@novr-demo.example.test'
const PASSWORD = 'NovrDemo-2026!'
const SUMMIT_SLUG = 'cybernovr-security-summit-2026'

async function signIn(page: Page) {
  await page.goto('/login?next=%2Fdashboard', { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(ORGANIZER)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

async function openRegistrations(page: Page) {
  const response = await page.request.get(`/api/v1/public/events/${SUMMIT_SLUG}`)
  test.skip(!response.ok(), 'Demo data is not loaded (run npm run db:seed:demo in novrevents-backend).')
  const { id } = (await response.json()) as { id: string }
  await page.goto(`/dashboard/events/${id}/registrations`, { waitUntil: 'networkidle' })
}

test.describe('organiser attendee drawer', () => {
  test('opens an attendee with the record and their answers, and closes with the keyboard', async ({
    page,
  }) => {
    await signIn(page)
    await openRegistrations(page)

    const attendee = page.getByRole('table').getByRole('button').first()
    const name = (await attendee.textContent())?.trim() ?? ''
    expect(name).not.toBe('')
    await attendee.click()

    const drawer = page.getByRole('dialog')
    await expect(drawer.getByRole('heading', { name, exact: true })).toBeVisible()
    await expect(drawer.getByRole('heading', { name: 'Answers' })).toBeVisible()
    // Exclusion rules are never shown to anyone in the attendee drawer.
    await expect(drawer.getByText(/Excluded by rules/)).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('the drawer fits the screen without horizontal scrolling', async ({ page }) => {
      await signIn(page)
      await openRegistrations(page)
      await page.getByRole('table').getByRole('button').first().click()

      const drawer = page.getByRole('dialog')
      await expect(drawer).toBeVisible()
      const box = await drawer.boundingBox()
      expect(box?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(390)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  })
})
