import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'

export const PASSWORD = 'e2e-correct-horse-battery'

/** The API repository, used only by the development helper that reads the local mail log. */
const BACKEND_DIR = process.env.BACKEND_DIR ?? path.resolve(process.cwd(), '..', 'novrevents-backend')

export function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export async function registerViaUi(page: Page, prefix = 'e2e') {
  const email = unique(prefix) + '@example.test'
  await page.goto('/auth/login', { waitUntil: 'networkidle' })
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('altcha-widget').getByRole('checkbox').press('Space')
  await page.getByRole('button', { name: 'Send code', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  return { email }
}
export async function verifyViaEmail(page: Page, email: string) {
  const tsx = path.join(BACKEND_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const script = path.join(BACKEND_DIR, 'scripts', 'dev-latest-link.ts')
  const code = execFileSync(process.execPath, [tsx, script, email, 'EMAIL_VERIFICATION', 'code'], {
    cwd: BACKEND_DIR,
    encoding: 'utf8',
  }).trim()
  await page.getByLabel('Verification code').fill(code)
  await page.getByRole('button', { name: 'Verify code' }).click()
  await page.getByLabel('New password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Save password and continue' }).click()
}
