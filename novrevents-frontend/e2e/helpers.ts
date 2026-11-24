import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'

export const PASSWORD = 'e2e-correct-horse-battery'

/** The API repository, used only by the development helper that reads the local mail log. */
const BACKEND_DIR = process.env.BACKEND_DIR ?? path.resolve(process.cwd(), '..', 'novrevents-backend')

export function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Returns the newest verification link sent to an address. Development only: the API's helper script refuses to
 * run outside NODE_ENV=development against a local database with the log email driver.
 */
export function latestVerificationLink(email: string): string {
  const tsx = path.join(BACKEND_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const script = path.join(BACKEND_DIR, 'scripts', 'dev-latest-link.ts')
  return execFileSync(process.execPath, [tsx, script, email], { cwd: BACKEND_DIR, encoding: 'utf8' }).trim()
}

/**
 * Creates an account through the sign-up form. The account is not verified; the page moves on to the
 * "Check your email" step.
 */
export async function registerViaUi(page: Page, prefix = 'e2e') {
  const username = unique(prefix).slice(0, 28)
  const email = `${username}@example.test`
  // Wait for hydration so the submit handler is attached.
  await page.goto('/register', { waitUntil: 'networkidle' })
  await page.getByLabel('Full name').fill(`E2E ${username}`)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByLabel(/I agree to the/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/check-email/)
  return { username, email }
}

/** Opens the emailed verification link, as the person would from their inbox. */
export async function verifyViaEmail(page: Page, email: string) {
  await page.goto(latestVerificationLink(email), { waitUntil: 'networkidle' })
}
