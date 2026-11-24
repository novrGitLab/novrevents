/**
 * Environment for the automated tests.
 *
 * The database comes from TEST_DATABASE_URL (never DATABASE_URL), and its name must end in `_test`.
 * That makes it impossible for the suite — which truncates tables — to run against a development
 * or production database by accident.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://novr:novr_dev_password@localhost:5432/novrevents_test'

export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '')
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against "${name}". The database name must end in "_test".`,
    )
  }
}

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  SESSION_SECRET: 'test-only-session-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  APP_URL: 'http://localhost:3100',
  CORS_ORIGINS: 'http://localhost:3100',
  COOKIE_SECURE: 'false',
  TRUST_PROXY: 'false',
  // Lowest allowed work factor keeps the suite fast; production uses 17.
  PASSWORD_HASH_LOG_N: '12',
  RATE_LIMIT_ENABLED: 'false',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: './.storage-test',
  EMAIL_DRIVER: 'log',
  JOBS_ENABLED: 'false',
  LOG_LEVEL: 'silent',
  API_DOCS_ENABLED: 'false',
}
