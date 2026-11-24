import { execSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import pg from 'pg'
import { assertTestDatabase, TEST_DATABASE_URL, TEST_ENV } from './test-env.js'

/** Tables that hold reference data created by migrations; they are left intact. */
const KEEP = new Set(['_prisma_migrations', 'event_categories'])

/**
 * Runs once before the whole suite: applies migrations to the test database and empties it.
 * Tests then create exactly the data they need.
 */
export default async function setup(): Promise<void> {
  assertTestDatabase(TEST_DATABASE_URL)

  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
    })
  } catch (error) {
    const output =
      (error as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? String(error)
    throw new Error(
      `Could not prepare the test database at ${new URL(TEST_DATABASE_URL).host}.\n` +
        `Start PostgreSQL with "npm run services:up" or set TEST_DATABASE_URL.\n${output}`,
      { cause: error },
    )
  }

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    )
    const tables = rows.map((row) => row.tablename).filter((name) => !KEEP.has(name))
    if (tables.length > 0) {
      const list = tables.map((name) => `"${name}"`).join(', ')
      await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
    }
  } finally {
    await client.end()
  }

  await rm(TEST_ENV.STORAGE_LOCAL_DIR as string, { recursive: true, force: true })
}
