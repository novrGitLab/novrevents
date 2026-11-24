import type { FastifyInstance, FastifyRequest } from 'fastify'
import { allowedOrigins, env } from '../config/env.js'
import { hmac, safeEqual, sha256 } from '../lib/crypto.js'
import { prisma } from '../lib/db.js'
import { AppError } from '../lib/errors.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const TOUCH_INTERVAL_MS = 5 * 60 * 1000

/** CSRF token bound to one session. Stateless: derived from the session id with the server secret. */
export function csrfTokenFor(sessionId: string): string {
  return hmac('csrf', sessionId)
}

async function resolveSession(request: FastifyRequest): Promise<void> {
  const token = request.cookies[env.SESSION_COOKIE_NAME]
  if (!token) return

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, email: true, role: true, status: true, emailVerifiedAt: true } },
    },
  })
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return
  if (session.user.status !== 'ACTIVE') return

  request.auth = {
    userId: session.user.id,
    sessionId: session.id,
    email: session.user.email,
    role: session.user.role,
    emailVerified: session.user.emailVerifiedAt !== null,
  }

  if (Date.now() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    prisma.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch((error: unknown) =>
        request.log.warn({ err: error }, 'failed to update session lastUsedAt'),
      )
  }
}

/**
 * CSRF defence for cookie-authenticated requests:
 *  1. Session cookies are SameSite=Lax, so cross-site POSTs do not carry them.
 *  2. Any state-changing request that declares an Origin must come from an allowed origin.
 *  3. Any state-changing request made with a session must echo that session's CSRF token in a
 *     custom header, which a cross-site page cannot read or set.
 */
function verifyCsrf(request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return
  if (request.routeOptions.config.csrf === false) return

  const origin = request.headers.origin
  if (origin && !allowedOrigins.includes(origin.replace(/\/$/, ''))) {
    throw new AppError(403, 'CSRF_FAILED', 'This request came from an origin that is not allowed.')
  }

  if (!request.auth) return
  const header = request.headers['x-csrf-token']
  const provided = Array.isArray(header) ? header[0] : header
  if (!provided || !safeEqual(provided, csrfTokenFor(request.auth.sessionId))) {
    throw new AppError(
      403,
      'CSRF_FAILED',
      'Your session could not be verified. Refresh the page and try again.',
    )
  }
}

export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('auth', null)
  app.addHook('onRequest', async (request) => {
    await resolveSession(request)
    verifyCsrf(request)
  })
}
