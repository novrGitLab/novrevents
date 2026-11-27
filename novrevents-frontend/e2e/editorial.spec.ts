import { expect, test } from '@playwright/test'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'

test('public photography, navigation and planner work across screen sizes @mobile', async ({
  page,
}, info) => {
  test.setTimeout(150000)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/The art of\s*going out\./)
  const consent = page.getByRole('button', { name: 'Essential only' })
  await consent.click()
  await expect(consent).toBeHidden()
  await page.locator('.cover-ticket img').evaluate(async (img: HTMLImageElement) => img.decode())
  const dir = process.env.E2E_SCREENSHOTS
  if (dir) {
    await mkdir(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, info.project.name + '-landing.png') })
  }
  await page.getByRole('button', { name: 'Next scene' }).click()
  await expect(page.getByRole('link', { name: 'Explore celebrations', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Previous scene' }).click()
  await expect(page.getByRole('link', { name: 'Find music events' })).toBeVisible()
  const brand = page.locator('header .event-wordmark').first()
  expect(await brand.innerHTML()).toBe(await page.locator('footer .event-wordmark').innerHTML())
  await page.getByRole('link', { name: /Weddings & anniversaries/i }).click()
  await page.waitForURL('**/guides/celebrations', { timeout: 60000 })
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Weddings/i)
  await page.getByRole('link', { name: 'Plan a celebration' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/occasion/i)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('link', { name: /Send an event brief/ }).click()
  await expect(page.locator('#planning-brief')).toBeInViewport()
  for (const route of ['/events', '/hosting', '/auth/login', '/admin/auth/login']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    if (dir)
      await page.screenshot({
        path: path.join(dir, info.project.name + '-' + route.slice(1).replaceAll('/', '-') + '.png'),
      })
  }
})
