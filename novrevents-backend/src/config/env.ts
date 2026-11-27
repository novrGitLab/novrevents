import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { z } from 'zod'

// Local development convenience. Variables already present in the environment win, and the test
// runner supplies its own values, so `.env` is never read during tests.
if (process.env.NODE_ENV !== 'test' && existsSync('.env')) {
  process.loadEnvFile('.env')
}

const flag = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .default(fallback ? 'true' : 'false')
    .transform((value) => value === 'true')

const EXAMPLE_SECRET = 'change-me-to-a-long-random-string-of-at-least-32-characters'

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    APP_URL: z.url().default('http://localhost:3100'),
    CORS_ORIGINS: z.string().default('http://localhost:3100'),

    NHAAI_BASE_URL: z.url({ protocol: /^https$/ }).optional(),
    NHAAI_MODEL: z.string().min(1).optional(),
    NHAAI_API_KEY: z.string().min(1).optional(),
    PAYSTACK_MODE: z.enum(['test', 'live']).default('test'),
    PAYSTACK_PUBLIC_KEY: z.string().optional(),
    PAYSTACK_SECRET_KEY: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_COOKIE_NAME: z.string().min(1).default('novr_session'),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    COOKIE_SECURE: flag(false),
    COOKIE_DOMAIN: z.string().optional(),
    TRUST_PROXY: flag(false),

    PASSWORD_HASH_LOG_N: z.coerce.number().int().min(12).max(20).default(17),
    RATE_LIMIT_ENABLED: flag(true),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./.storage'),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: flag(true),

    GMAIL_APP_PASSWORD: z.string().length(16).optional(),
    EMAIL_DRIVER: z.enum(['log', 'brevo', 'gmail']).default('log'),
    BREVO_API_KEY: z.string().optional(),
    BREVO_WEBHOOK_TOKEN: z.string().optional(),
    EMAIL_FROM_ADDRESS: z.email().default('events@example.com'),
    EMAIL_FROM_NAME: z.string().min(1).default('NOVR Events'),
    EMAIL_REPLY_TO: z.email().optional(),

    JOBS_ENABLED: flag(true),
    JOBS_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(2000),

    API_DOCS_ENABLED: flag(false),
  })
  .superRefine((value, ctx) => {
    if (value.PAYSTACK_SECRET_KEY || value.PAYSTACK_PUBLIC_KEY) {
      for (const [field, prefix] of [
        ['PAYSTACK_PUBLIC_KEY', 'pk'],
        ['PAYSTACK_SECRET_KEY', 'sk'],
      ] as const) {
        if (
          !new RegExp('^' + prefix + '_' + value.PAYSTACK_MODE + '_[A-Za-z0-9]{20,128}$').test(
            value[field] ?? '',
          )
        ) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: 'A complete key pair for the selected Paystack mode is required.',
          })
        }
      }
    }
    if (value.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=s3`,
          })
        }
      }
    }
    if (
      value.EMAIL_DRIVER === 'gmail' &&
      (!value.GMAIL_APP_PASSWORD || !value.EMAIL_FROM_ADDRESS.toLowerCase().endsWith('@gmail.com'))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_DRIVER'],
        message: 'Gmail delivery requires a Gmail sender address and its app password.',
      })
    }
    if (value.EMAIL_DRIVER === 'brevo' && !value.BREVO_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['BREVO_API_KEY'],
        message: 'BREVO_API_KEY is required when EMAIL_DRIVER=brevo',
      })
    }
    if (value.NODE_ENV === 'production') {
      // Local storage in production must point at a persistent volume (Railway: mounted at /data).
      // A relative path would land inside the container and be lost on the next deploy.
      if (value.STORAGE_DRIVER === 'local' && !isAbsolute(value.STORAGE_LOCAL_DIR)) {
        ctx.addIssue({
          code: 'custom',
          path: ['STORAGE_LOCAL_DIR'],
          message:
            'STORAGE_LOCAL_DIR must be an absolute path on a persistent volume in production (for example /data/uploads)',
        })
      }
      if (!value.COOKIE_SECURE) {
        ctx.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'COOKIE_SECURE must be true in production',
        })
      }
      if (value.SESSION_SECRET === EXAMPLE_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['SESSION_SECRET'],
          message: 'SESSION_SECRET still has the example value',
        })
      }
    }
  })

function load() {
  // Treat empty strings (e.g. `COOKIE_DOMAIN=`) as "not set".
  const source = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''))
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`,
    )
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`)
  }
  return parsed.data
}

export const env = load()

export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'

/** Browser origins allowed to make credentialed requests. */
export const allowedOrigins: string[] = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean)

/** Public frontend origin without a trailing slash. */
export const appUrl = env.APP_URL.replace(/\/$/, '')
