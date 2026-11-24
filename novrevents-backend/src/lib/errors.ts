/** A single field-level problem, safe to show to the caller. */
export interface ErrorDetail {
  path: string
  message: string
}

/**
 * The only error type route handlers and services should throw on purpose.
 * The error handler plugin turns it into the standard `{ error: { code, message, … } }` reply.
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: ErrorDetail[]

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: ErrorDetail[]) =>
  new AppError(400, code, message, details)

export const validationError = (details: ErrorDetail[], message = 'Some fields are invalid.') =>
  new AppError(400, 'VALIDATION_ERROR', message, details)

export const unauthorized = (message = 'Sign in to continue.') =>
  new AppError(401, 'UNAUTHORIZED', message)

export const forbidden = (message = 'You do not have permission to do this.', code = 'FORBIDDEN') =>
  new AppError(403, code, message)

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`)

export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message)

export const gone = (message: string, code = 'GONE') => new AppError(410, code, message)

export const unprocessable = (message: string, code = 'UNPROCESSABLE', details?: ErrorDetail[]) =>
  new AppError(422, code, message, details)

export const payloadTooLarge = (message = 'The upload is too large.') =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', message)

export const unsupportedMedia = (message = 'This file type is not allowed.') =>
  new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', message)
