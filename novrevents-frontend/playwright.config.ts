import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests drive the real web app against a real API and database.
 * Start both first (API on :4000 with EMAIL_DRIVER=log, web on :3100), then: npm run test:e2e
 * Set E2E_BASE_URL to test another deployment.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Every test drives the same live web app, API and database; running files in parallel overloads
  // the local API and makes timings flaky.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
})
