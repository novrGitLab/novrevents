import type { FastifyRequest } from 'fastify'
import { AppError, forbidden, unauthorized } from '../lib/errors.js'
import type { AuthContext } from '../types/fastify.js'

/** Returns the signed-in caller or throws 401. */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized()
  return request.auth
}

/**
 * Publishing, sending email and other actions that reach the public require a verified address.
 * This is one of the abuse safeguards for public events.
 */
export function requireVerified(request: FastifyRequest): AuthContext {
  const auth = requireAuth(request)
  if (!auth.emailVerified) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email address to use this feature.')
  }
  return auth
}

/** Platform administration only. */
export function requireAdmin(request: FastifyRequest): AuthContext {
  const auth = requireAuth(request)
  if (auth.role !== 'ADMIN') throw forbidden('Administrator access is required.')
  return auth
}
