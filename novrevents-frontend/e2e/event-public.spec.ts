import { expect, test } from '@playwright/test'

/** Phase 2B: public event details, calendar export and the public profile. Needs the demo data. */
test.describe('public event details', () => {
  test.beforeAll(async ({ request }) => {
    const response = await request.get('/api/v1/public/events/cybernovr-security-summit-2026')
    test.skip(!response.ok(), 'Demo data is not loaded (run npm run db:seed:demo in novrevents-backend).')
  })

  test('the event page offers a calendar file in UTC that leaks no organiser email', async ({
    page,
    request,
  }) => {
    await page.goto('/events/cybernovr-security-summit-2026', { waitUntil: 'networkidle' })
    await expect(
      page.getByRole('heading', { level: 1, name: 'Cybernovr Security Summit 2026' }),
    ).toBeVisible()

    const link = page.getByRole('link', { name: 'Add to calendar' }).first()
    await expect(link).toBeVisible()
    const href = await link.getAttribute('href')
    expect(href).toBe('/api/v1/public/events/cybernovr-security-summit-2026/calendar.ics')

    const file = await request.get(href ?? '')
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toContain('text/calendar')
    const body = await file.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/)
    expect(body).not.toContain('events@novr-demo.example.test')
  })

  test('a missing event gives a clear not-found page, not a calendar file', async ({ request }) => {
    const response = await request.get('/api/v1/public/events/does-not-exist-xyz/calendar.ics')
    expect(response.status()).toBe(404)
  })

  test('the public profile shows no email address', async ({ page }) => {
    await page.goto('/u/amara-okafor', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { level: 1, name: 'Amara Okafor' })).toBeVisible()
    await expect(page.getByText(/@example\.test|novr-demo\.example\.test/)).toHaveCount(0)
  })
})
