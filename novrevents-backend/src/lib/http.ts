import { z } from 'zod'

// ─── Shared request/response contracts ───────────────────────────────────────

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().describe('Stable machine-readable error code.'),
      message: z.string().describe('Human-readable explanation, safe to display.'),
      details: z
        .array(z.object({ path: z.string(), message: z.string() }))
        .optional()
        .describe('Field-level problems for validation errors.'),
      requestId: z.string(),
    }),
  })
  .meta({ id: 'ErrorResponse' })

/**
 * Adds the standard error envelope to a route's success responses so every operation documents it.
 */
export function responses<T extends Record<number, z.ZodType>>(success: T) {
  return { ...success, '4xx': errorResponseSchema, '5xx': errorResponseSchema }
}

export const okSchema = z.object({ ok: z.literal(true) }).meta({ id: 'Ok' })
export const OK = { ok: true } as const

export const idParams = z.object({ id: z.uuid() })

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  })
}

export function pageOf<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}

export function skipTake(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize }
}

/** Marks an operation as requiring a signed-in session in the OpenAPI document. */
export const secured = { security: [{ sessionCookie: [] as string[] }] }

// ─── Reusable field validators ───────────────────────────────────────────────

/** Trims, and turns an empty string into null so optional text fields can be cleared. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null))

export const requiredText = (min: number, max: number) => z.string().trim().min(min).max(max)

export const emailField = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email('Enter a valid email address.'))
  .transform((value) => value.toLowerCase())

/** http(s) URL only — blocks `javascript:` and other schemes that could be rendered as links. */
export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
      return false
    }
  }, 'Enter a valid http(s) URL.')

export const optionalHttpUrl = z
  .union([httpUrl, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value ? value : null))

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour such as #0EA5E9.')

const SUPPORTED_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'))
SUPPORTED_TIMEZONES.add('UTC')

export const timezoneField = z
  .string()
  .refine(
    (value) => SUPPORTED_TIMEZONES.has(value),
    'Use an IANA timezone name such as Africa/Lagos.',
  )

/** ISO-8601 instant with an offset (e.g. 2026-11-30T09:00:00Z), parsed to a Date. */
export const isoDateTime = z.iso.datetime({ offset: true }).transform((value) => new Date(value))
