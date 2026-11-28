import { expect, test, type Page } from '@playwright/test'

/** Phase 2D: the organiser's attendee drawer on the registrations page, with real demo data. */
const ORGANIZER = 'organizer@novr-demo.example.test'
const PASSWORD = 'NovrDemo-2026!'
const SUMMIT_SLUG = 'cybernovr-security-summit-2026'

async function signIn(page: Page) {
  await page.goto('/login?next=%2Fdashboard', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Use a password instead' }).click()
  await page.getByLabel('Email or username').fill(ORGANIZER)
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

  test('a confirmed attendee has ticket email history @mobile', async ({ page }) => {
    await signIn(page)
    await openRegistrations(page)
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('CONFIRMED')
    const attendee = page.getByRole('row').filter({ has: page.getByText('Confirmed', { exact: true }) }).first()
    await attendee.getByRole('button').first().click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByRole('heading', { name: 'Ticket emails' })).toBeVisible()
    await expect(drawer.getByRole('list', { name: 'Five most recent ticket emails' }).or(drawer.getByText('No ticket email has been recorded.'))).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Resend ticket' })).toBeVisible()
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

test('publishes a flyer from five layouts with a printable page and ticket destination', async ({
  page,
  browser,
}) => {
  await signIn(page)
  const event = await page.request.get(`/api/v1/public/events/${SUMMIT_SLUG}`)
  test.skip(!event.ok(), 'The seeded summit is required for the flyer walkthrough.')
  const { id } = await event.json()
  await page.goto(`/dashboard/events/${id}/flyer`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Essential only' }).click()
  const template = page.getByLabel('Template', { exact: true })
  const photography = page.getByLabel('Photography')
  const shared = page.getByLabel('Enable public flyer link')
  const original = {
    template: await template.inputValue(),
    photo: await photography.inputValue(),
    shared: await shared.isChecked(),
  }
  const flyer = page.getByRole('article', { name: 'Event flyer' })
  const guest = await browser.newContext()
  try {
    for (const style of ['marquee', 'programme', 'invitation', 'afterhours', 'studio']) {
      await template.selectOption(style)
      await expect(flyer).toHaveClass(new RegExp('flyer-' + style))
    }
    await photography.selectOption('cyber')
    await shared.check()
    await page.getByRole('button', { name: 'Save design' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Flyer saved.' })).toBeVisible()
    const poster = await guest.newPage()
    await poster.goto(`/events/${SUMMIT_SLUG}/flyer`, { waitUntil: 'networkidle' })
    const publicFlyer = poster.getByRole('article', { name: 'Event flyer' })
    await expect(publicFlyer).toHaveClass(/flyer-studio/)
    await expect(
      publicFlyer.getByRole('img', { name: 'QR code linking to event registration' }),
    ).toHaveJSProperty('complete', true)
    const pdf = await poster.pdf({ printBackground: true, preferCSSPageSize: true })
    expect(pdf.toString('ascii', 0, 5)).toBe('%PDF-')
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(1)
    await publicFlyer.getByRole('link', { name: /registration/i }).click()
    await expect(poster).toHaveURL(/\/f\//)
    await expect(poster.getByRole('heading', { name: 'Register for the Summit' })).toBeVisible()
  } finally {
    await guest.close()
    await template.selectOption(original.template)
    await photography.selectOption(original.photo)
    await shared.setChecked(original.shared)
    await page.getByRole('button', { name: 'Save design' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Flyer saved.' })).toBeVisible()
  }
})
