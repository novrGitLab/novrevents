import createClient, { type Middleware } from 'openapi-fetch'
import { ApiError } from './errors'
import type { components, paths } from './schema'

/** Named schemas from the API contract, e.g. `Schema<'EventDetail'>`. */
export type Schema<K extends keyof components['schemas']> = components['schemas'][K]

type JsonOf<R> = R extends { content: { 'application/json': infer T } } ? T : never
type SuccessOf<Op> = Op extends { responses: infer Responses }
  ? Responses extends { 200: infer R }
    ? JsonOf<R>
    : Responses extends { 201: infer R }
      ? JsonOf<R>
      : never
  : never

/** Success body of an operation, e.g. `ApiData<'/api/v1/forms/{id}', 'get'>`. */
export type ApiData<P extends keyof paths, M extends keyof paths[P]> = SuccessOf<paths[P][M]>

// ─── CSRF ────────────────────────────────────────────────────────────────────
// The token comes from GET /auth/session and is bound to the HTTP-only session cookie.

let csrfToken: string | null = null

export function setCsrfToken(token: string | null): void {
  csrfToken = token
}

/**
 * Loads the CSRF token for the current session when this page does not have one yet. A full page load from an
 * emailed link, or a page opened before the session query ran, starts without it. Call before a state-changing
 * request that may be sent with a session cookie.
 */
export async function ensureCsrfToken(): Promise<void> {
  if (csrfToken) return
  const result = await api.GET('/api/v1/auth/session')
  csrfToken = result.data?.csrfToken ?? null
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const csrfMiddleware: Middleware = {
  onRequest({ request }) {
    if (!SAFE_METHODS.has(request.method) && csrfToken) request.headers.set('x-csrf-token', csrfToken)
    return request
  },
}

/** Typed client. Relative base URL: requests go to this app's origin and are proxied to the API. */
export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' })
api.use(csrfMiddleware)

type FetchResult<T> = { data?: T; error?: unknown; response: Response }

/** Unwraps an openapi-fetch result, throwing `ApiError` for any non-2xx response. */
export async function unwrap<T>(promise: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>
  try {
    result = await promise
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.')
  }
  if (result.error !== undefined || !result.response.ok) {
    throw ApiError.fromBody(result.response.status, result.error)
  }
  return result.data as T
}

/** Multipart upload (images and form files). Adds the CSRF header like the typed client. */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {}
  if (csrfToken) headers['x-csrf-token'] = csrfToken
  let response: Response
  try {
    response = await fetch(path, { method: 'POST', body: form, headers, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.')
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw ApiError.fromBody(response.status, body)
  return body as T
}

/** Builds a query string, dropping empty values. */
export function toQuery(values: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}
