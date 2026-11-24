import { expect, test, type Browser } from '@playwright/test'
import { unique } from './helpers'

/**
 * The live-demo walkthrough against the local demo data (`npm run db:seed:demo` in the API repo).
 * Skipped automatically when that data is not loaded. It adds records (a guest registration, a
 * check-in, an unlisted event and its form), so re-run the seed with `--refresh` before a demo.
 */
const PASSWORD = 'NovrDemo-2026!'
const ORGANIZER = 'organizer@novr-demo.example.test'
// A second verified demo organiser, so test events never appear in the main demo account.
const TEST_ORGANIZER = 'halima@novr-demo.example.test'

async function signIn(browser: Browser, email: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  return { context, page }
}

test.describe('demo walkthrough', () => {
  test.beforeAll(async ({ request }) => {
    const response = await request.get('/api/v1/public/events/cybernovr-security-summit-2026')
    test.skip(!response.ok(), 'Demo data is not loaded (run npm run db:seed:demo in novrevents-backend).')
  })

  test('guest registers, gets a QR ticket, is checked in once and the duplicate is caught', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000)
    // Discover → event page → registration form, as a signed-out guest.
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Cybernovr Security Summit 2026' }).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cybernovr Security Summit 2026')
    await page.getByRole('link', { name: 'Register' }).click()
    await expect(page.getByRole('heading', { name: 'Register for the Summit' })).toBeVisible()

    const email = `${unique('guest')}@attendee.example.test`
    await page.getByLabel('Full name').fill('Demo Guest')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Which best describes your role?').selectOption({ label: 'SOC analyst' })
    await page.getByRole('button', { name: 'Register' }).click()
    await page.getByRole('link', { name: 'View my ticket' }).click()

    // The ticket page shows the real QR image and offers the PDF.
    await expect(page.getByRole('img', { name: /QR code for ticket/ })).toBeVisible({ timeout: 45_000 })
    const code =
      (
        await page
          .getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
          .first()
          .textContent()
      )?.trim() ?? ''
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    const pdfHref = await page.getByRole('link', { name: 'Download PDF' }).getAttribute('href')
    const pdf = await page.request.get(pdfHref ?? '')
    expect(pdf.ok()).toBe(true)
    expect(pdf.headers()['content-type']).toContain('application/pdf')

    // Organiser checks the ticket in at the door; a second attempt is rejected as a duplicate.
    const organiser = await signIn(browser, ORGANIZER)
    const door = organiser.page
    await door.goto('/dashboard/events', { waitUntil: 'networkidle' })
    await door.getByRole('link', { name: 'Cybernovr Security Summit 2026' }).click()
    await door
      .getByRole('navigation', { name: 'Event sections' })
      .getByRole('link', { name: 'Check-in', exact: true })
      .click()
    await door.getByPlaceholder('Name, email or the code printed on the ticket').fill(code)
    await door.getByRole('button', { name: `Check in ticket code ${code}` }).click()
    await expect(door.getByText('Checked in', { exact: true }).first()).toBeVisible()
    await door.getByRole('button', { name: `Check in ticket code ${code}` }).click()
    await expect(door.getByText('Already used', { exact: true }).first()).toBeVisible()
    await organiser.context.close()
  })

  test('organiser publishes an event and a volunteer form with a limit and an exclusion rule', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const { context, page } = await signIn(browser, TEST_ORGANIZER)
    const title = `Demo rehearsal ${unique('ev')}`

    // Create and publish (unlisted, so rehearsals never reach the public directory).
    await page.goto('/dashboard/events/new', { waitUntil: 'networkidle' })
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('Description').fill('A rehearsal event created by the automated demo walkthrough.')
    await page.getByLabel('Category').selectOption({ label: 'Cloud Security' })
    await page.getByLabel(/^Starts/).fill('2031-05-10T09:00')
    await page.getByLabel(/^Ends/).fill('2031-05-10T17:00')
    await page.getByLabel('Venue name').fill('Rehearsal Hall')
    await page.getByLabel('City', { exact: true }).fill('Lagos')
    await page.getByLabel('Visibility').selectOption('UNLISTED')
    await page.getByRole('button', { name: 'Create draft' }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText('Published', { exact: true })).toBeVisible()

    // Volunteer form from the event workspace.
    await page
      .getByRole('navigation', { name: 'Event sections' })
      .getByRole('link', { name: 'Forms', exact: true })
      .first()
      .click()
    await page.getByRole('button', { name: 'New form' }).click()
    await page.getByLabel('Form type').selectOption('VOLUNTEER')
    await page.getByLabel('Title').fill('Volunteer with us')
    await page.getByRole('button', { name: 'Create and open builder' }).click()
    await expect(page.getByRole('heading', { name: 'Live preview' })).toBeVisible()

    // Add "Are you 18 or older?" (single choice Yes / No) from the question palette.
    await page.getByRole('button', { name: 'Single choice', exact: true }).click()
    await page.getByLabel('Question', { exact: true }).fill('Are you 18 or older?')
    await page
      .getByRole('complementary', { name: 'Properties' })
      .getByLabel('Option 1', { exact: true })
      .fill('Yes')
    await page
      .getByRole('complementary', { name: 'Properties' })
      .getByLabel('Option 2', { exact: true })
      .fill('No')
    await page
      .getByRole('complementary', { name: 'Properties' })
      .getByLabel('Required', { exact: true })
      .check()

    // Exclusion rule: "Are you 18 or older?" is "No".
    await page.getByRole('tab', { name: /Logic/ }).click()
    await page.getByRole('button', { name: 'Exclude response' }).click()
    await page.getByLabel('Question').last().selectOption({ label: 'Are you 18 or older?' })
    await page.getByLabel('Value').last().selectOption({ label: 'No' })
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText('Form published')).toBeVisible()

    // Response limit of 50.
    await page.getByRole('tab', { name: /Limits/ }).click()
    await page.getByLabel('Response limit').fill('50')
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()

    await page.getByRole('tab', { name: 'Share' }).click()
    const formUrl = await page.getByLabel('Form link').inputValue()
    const formPath = new URL(formUrl).pathname

    // Two guest responses: one qualifying, one excluded. Both see the same neutral acknowledgement.
    const messages: string[] = []
    for (const [answer, name] of [
      ['Yes', 'Qualifying Volunteer'],
      ['No', 'Excluded Volunteer'],
    ] as const) {
      const guest = await browser.newPage()
      await guest.goto(formPath, { waitUntil: 'networkidle' })
      await guest.getByLabel('Full name').fill(name)
      await guest.getByLabel('Email address').fill(`${unique('vol')}@attendee.example.test`)
      await guest.getByLabel('During the event').check()
      await guest.getByLabel(answer, { exact: true }).check()
      await guest.getByRole('button', { name: 'Submit' }).click()
      const status = guest.getByRole('status').filter({ hasText: /./ }).last()
      await expect(status).toBeVisible()
      messages.push((await status.textContent()) ?? '')
      await guest.close()
    }
    expect(messages[0]).toBe(messages[1])

    // Responses: 2 received, 1 qualifying, 1 excluded, 49 places left of 50.
    await page.getByRole('link', { name: 'Responses' }).click()
    await expect(page.getByText('Limit 50')).toBeVisible()
    await expect(page.getByText('49', { exact: true })).toBeVisible()
    await context.close()
  })
})
