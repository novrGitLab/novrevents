import type { FastifyReply, FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { audit } from '../../lib/audit.js'
import { notFound } from '../../lib/errors.js'
import { idParams, OK, okSchema, responses, secured } from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import { csrfTokenFor } from '../../plugins/auth.js'
import { limits } from '../../plugins/rate-limit.js'
import { prisma } from '../../lib/db.js'
import { sha256 } from '../../lib/crypto.js'
import {
  activeSessionSchema,
  changeEmailBody,
  resendByEmailBody,
  changePasswordBody,
  forgotPasswordBody,
  loginBody,
  registerBody,
  resetPasswordBody,
  sessionResponse,
  tokenBody,
} from './auth.schemas.js'
import * as service from './auth.service.js'

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  void reply.setCookie(env.SESSION_COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: service.sessionMaxAgeSeconds,
  })
}

function clearSessionCookie(reply: FastifyReply): void {
  void reply.clearCookie(env.SESSION_COOKIE_NAME, cookieOptions)
}

const clientMeta = (request: FastifyRequest): service.ClientMeta => ({
  ip: request.ip,
  userAgent: request.headers['user-agent'] ?? null,
})

/** Builds the session payload for a freshly created session (the cookie is not on the request yet). */
async function sessionPayloadForToken(userId: string, sessionToken: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { tokenHash: sha256(sessionToken) },
    select: { id: true },
  })
  return {
    authenticated: true,
    user: await service.getSessionUser(userId),
    csrfToken: csrfTokenFor(session.id),
  }
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/auth/register',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Create an account',
        description:
          'Creates the account and its profile, signs the user in, and emails a verification link.',
        body: registerBody,
        response: responses({ 201: sessionResponse }),
      },
      config: { rateLimit: limits.auth },
    },
    async (request, reply) => {
      const { userId, sessionToken } = await service.registerUser(request.body, clientMeta(request))
      setSessionCookie(reply, sessionToken)
      await audit(request, { action: 'auth.register', targetType: 'user', targetId: userId })
      return reply.status(201).send(await sessionPayloadForToken(userId, sessionToken))
    },
  )

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Sign in',
        body: loginBody,
        response: responses({ 200: sessionResponse }),
      },
      config: { rateLimit: limits.auth },
    },
    async (request, reply) => {
      const { userId, sessionToken } = await service.authenticate(
        request.body.email,
        request.body.password,
        clientMeta(request),
      )
      setSessionCookie(reply, sessionToken)
      await audit(request, { action: 'auth.login', targetType: 'user', targetId: userId })
      return sessionPayloadForToken(userId, sessionToken)
    },
  )

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Sign out of the current session',
        response: responses({ 200: okSchema }),
      },
    },
    async (request, reply) => {
      if (request.auth) await service.revokeSession(request.auth.sessionId, request.auth.userId)
      clearSessionCookie(reply)
      return OK
    },
  )

  app.get(
    '/auth/session',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Current session',
        description:
          'Always returns 200. `authenticated` is false for anonymous visitors. The `csrfToken` must be ' +
          'sent as `X-CSRF-Token` on state-changing requests.',
        response: responses({ 200: sessionResponse }),
      },
    },
    async (request) => {
      if (!request.auth) return { authenticated: false, user: null, csrfToken: null }
      return {
        authenticated: true,
        user: await service.getSessionUser(request.auth.userId),
        csrfToken: csrfTokenFor(request.auth.sessionId),
      }
    },
  )

  app.post(
    '/auth/verify-email',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Verify an email address with the emailed token',
        body: tokenBody,
        response: responses({ 200: okSchema }),
      },
      config: { rateLimit: limits.auth },
    },
    async (request) => {
      const userId = await service.verifyEmail(request.body.token)
      await audit(request, { action: 'auth.email_verified', targetType: 'user', targetId: userId })
      return OK
    },
  )

  app.post(
    '/auth/resend-verification',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Email a new verification link',
        ...secured,
        response: responses({ 200: okSchema }),
      },
      config: { rateLimit: limits.email },
    },
    async (request) => {
      await service.resendVerification(requireAuth(request).userId)
      return OK
    },
  )

  app.post(
    '/auth/resend-verification-by-email',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Email a new verification link to an unverified address (no sign-in needed)',
        description:
          'Responds identically whether or not the address belongs to an unverified account. Rate limited, and at most one email per minute per account.',
        body: resendByEmailBody,
        response: responses({ 200: okSchema }),
      },
      config: { rateLimit: limits.email },
    },
    async (request) => {
      await service.requestVerificationByEmail(request.body.email)
      return OK
    },
  )

  app.post(
    '/me/onboarding',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Finish or skip the one-time welcome',
        description: 'Idempotent. The first completion time is kept.',
        ...secured,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      await service.completeOnboarding(requireAuth(request).userId)
      return OK
    },
  )

  app.post(
    '/auth/forgot-password',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Request a password reset email',
        description: 'Responds identically whether or not the address belongs to an account.',
        body: forgotPasswordBody,
        response: responses({ 200: okSchema }),
      },
      config: { rateLimit: limits.email },
    },
    async (request) => {
      await service.requestPasswordReset(request.body.email)
      return OK
    },
  )

  app.post(
    '/auth/reset-password',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Set a new password with the emailed token',
        description: 'Signs out every existing session for the account.',
        body: resetPasswordBody,
        response: responses({ 200: okSchema }),
      },
      config: { rateLimit: limits.auth },
    },
    async (request, reply) => {
      const userId = await service.resetPassword(request.body.token, request.body.password)
      clearSessionCookie(reply)
      await audit(request, { action: 'auth.password_reset', targetType: 'user', targetId: userId })
      return OK
    },
  )

  app.post(
    '/auth/change-password',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Change the password of the signed-in account',
        description: 'Other sessions are signed out; the current one stays active.',
        ...secured,
        body: changePasswordBody,
        response: responses({ 200: okSchema }),
      },
      config: { rateLimit: limits.auth },
    },
    async (request) => {
      const auth = requireAuth(request)
      await service.changePassword(
        auth.userId,
        auth.sessionId,
        request.body.currentPassword,
        request.body.newPassword,
      )
      await audit(request, {
        action: 'auth.password_changed',
        targetType: 'user',
        targetId: auth.userId,
      })
      return OK
    },
  )

  app.post(
    '/auth/change-email',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Change the account email address',
        description: 'Requires the current password. The new address must be verified again.',
        ...secured,
        body: changeEmailBody,
        response: responses({ 200: okSchema }),
      },
      config: { rateLimit: limits.auth },
    },
    async (request) => {
      const auth = requireAuth(request)
      await service.changeEmail(auth.userId, request.body.email, request.body.password)
      await audit(request, {
        action: 'auth.email_changed',
        targetType: 'user',
        targetId: auth.userId,
        metadata: { from: auth.email, to: request.body.email },
      })
      return OK
    },
  )

  app.get(
    '/auth/sessions',
    {
      schema: {
        tags: ['Auth'],
        summary: 'List active sessions for the signed-in account',
        ...secured,
        response: responses({ 200: z.object({ items: z.array(activeSessionSchema) }) }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const sessions = await service.listSessions(auth.userId)
      return {
        items: sessions.map((session) => ({ ...session, current: session.id === auth.sessionId })),
      }
    },
  )

  app.delete(
    '/auth/sessions/:id',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Sign out one session',
        ...secured,
        params: idParams,
        response: responses({ 200: okSchema }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request)
      const revoked = await service.revokeSession(request.params.id, auth.userId)
      if (!revoked) throw notFound('Session')
      if (request.params.id === auth.sessionId) clearSessionCookie(reply)
      await audit(request, {
        action: 'auth.session_revoked',
        targetType: 'session',
        targetId: request.params.id,
      })
      return OK
    },
  )

  app.post(
    '/auth/sessions/revoke-others',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Sign out every session except the current one',
        ...secured,
        response: responses({ 200: z.object({ revoked: z.number().int() }) }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const revoked = await service.revokeAllSessions(prisma, auth.userId, auth.sessionId)
      await audit(request, {
        action: 'auth.sessions_revoked',
        targetType: 'user',
        targetId: auth.userId,
      })
      return { revoked }
    },
  )
}
