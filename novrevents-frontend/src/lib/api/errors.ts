import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

export interface ErrorDetail {
  path: string
  message: string
}

/** Every non-2xx API response, normalised from `{ error: { code, message, details, requestId } }`. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: ErrorDetail[]
  readonly requestId: string | null

  constructor(
    status: number,
    code: string,
    message: string,
    details: ErrorDetail[] = [],
    requestId: string | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }

  static fromBody(status: number, body: unknown): ApiError {
    const error = (
      body as {
        error?: { code?: string; message?: string; details?: ErrorDetail[]; requestId?: string }
      } | null
    )?.error
    if (error?.code && error.message) {
      return new ApiError(status, error.code, error.message, error.details ?? [], error.requestId ?? null)
    }
    if (status === 429)
      return new ApiError(status, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.')
    if (status >= 500)
      return new ApiError(status, 'SERVER_ERROR', 'Something went wrong on our side. Please try again.')
    return new ApiError(status, 'UNKNOWN', 'The request could not be completed.')
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

/** A message that is always safe to show. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isApiError(error)) return error.message
  return fallback
}

export const hasCode = (error: unknown, ...codes: string[]) => isApiError(error) && codes.includes(error.code)

/**
 * Maps validation details (`body.email`, `answers.full_name`, …) onto React Hook Form fields.
 * Returns true when at least one field error was applied.
 */
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  prefixes: string[] = ['body.'],
): boolean {
  if (!isApiError(error) || error.details.length === 0) return false
  let applied = false
  for (const detail of error.details) {
    const prefix = prefixes.find((candidate) => detail.path.startsWith(candidate))
    if (prefix === undefined) continue
    setError(detail.path.slice(prefix.length) as Path<T>, { type: 'server', message: detail.message })
    applied = true
  }
  return applied
}
