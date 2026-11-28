import {
  authorizeSender,
  emailAvailability,
  sendScope,
  senderAddress,
  senderStatus,
} from '../../lib/email/google-sender.js'
import { requireAdmin } from '../../middleware/auth.js'
import { randomBytes } from 'node:crypto'
import * as oidc from 'openid-client'
import { claimAdminInvitation } from './admin-invitation.js'
import { z } from 'zod'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { appUrl, env } from '../../config/env.js'
import { POLICY_VERSION } from '../../config/policy.js'
import { hashPassword, signValue, verifySignedValue } from '../../lib/crypto.js'
import { prisma } from '../../lib/db.js'
import { badRequest, forbidden } from '../../lib/errors.js'
import { responses } from '../../lib/http.js'
import { limits } from '../../plugins/rate-limit.js'
import { getSettings } from '../admin/settings.service.js'
import { createSession, sessionMaxAgeSeconds } from './auth.service.js'

let googleConfiguration: Promise<oidc.Configuration> | undefined

function googleClient() {
  if (!googleConfiguration) {
    googleConfiguration = oidc
      .discovery(
        new URL('https://accounts.google.com'),
        env.GOOGLE_CLIENT_ID!,
        { client_secret: env.GOOGLE_CLIENT_SECRET!, id_token_signed_response_alg: 'RS256' },
        oidc.ClientSecretPost(),
        { execute: [oidc.enableNonRepudiationChecks], timeout: 10 },
      )
      .catch((error: unknown) => {
        googleConfiguration = undefined
        throw error
      })
  }
  return googleConfiguration
}
const callback = appUrl + '/api/v1/auth/google/callback'
const flowCookie = 'novr_google_flow'
const cookie = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/api/v1/auth/google/callback',
}
const flowSchema = z.object({
  state: z.string(),
  nonce: z.string(),
  verifier: z.string(),
  expires: z.number(),
  mode: z.enum(['login', 'register', 'link', 'admin', 'sender', 'continue']),
  next: z.string().optional(),
  session: z.string().nullable(),
  policy: z.string().nullable(),
})
const enabled = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
const random = () => randomBytes(32).toString('base64url')
const start = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('login') }),
  z.object({ mode: z.literal('admin') }),
  z.object({ mode: z.literal('sender') }),
  z.object({
    mode: z.literal('continue'),
    next: z.string().max(2048).optional(),
    acceptTerms: z.literal(true),
    policyVersion: z.literal(POLICY_VERSION),
  }),
  z.object({ mode: z.literal('link') }),
  z.object({
    mode: z.literal('register'),
    acceptTerms: z.literal(true),
    policyVersion: z.literal(POLICY_VERSION),
  }),
])
const claims = z.object({
  sub: z.string().min(1).max(255),
  email: z.email().max(254),
  email_verified: z.literal(true),
  nonce: z.string(),
  hd: z.string().optional(),
  name: z.string().optional(),
})

function returnPath(value?:string) {
 if(!value || !value.startsWith('/') || value.startsWith('//') || value.includes(String.fromCharCode(92)) || Array.from(value).some(c=>c.charCodeAt(0)<32))return undefined
 const url=new URL(value,appUrl)
 return url.origin===new URL(appUrl).origin?url.pathname+url.search+url.hash:undefined
}

async function signIn(
  profile: z.infer<typeof claims>,
  flow: z.infer<typeof flowSchema>,
  request: FastifyRequest,
) {
  const email = profile.email.trim().toLowerCase()
  const meta = { ip: request.ip, userAgent: request.headers['user-agent'] ?? null }
  const enrollment = flow.mode === 'register' || flow.mode === 'continue'
  const passwordHash = enrollment ? await hashPassword(random()) : null
  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: { googleSubject: profile.sub },
      select: { id: true, status: true, role: true },
    })
    if (flow.mode === 'link') {
      const account = request.auth
      if (
        !account ||
        !account.emailVerified ||
        account.sessionId !== flow.session ||
        account.email !== email ||
        (user && user.id !== account.userId)
      )
        throw forbidden('Account details do not match.')
      const updated = await tx.user.updateMany({
        where: {
          id: account.userId,
          email,
          status: 'ACTIVE',
          OR: [{ googleSubject: null }, { googleSubject: profile.sub }],
        },
        data: { googleSubject: profile.sub },
      })
      if (!updated.count) throw forbidden('Could not link this account.')
      return null
    }
    if (!user && flow.mode === 'continue') {
      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true, emailVerifiedAt: true, googleSubject: true, status: true, role: true },
      })
      // Google is authoritative for verified Gmail and hosted Workspace addresses.
      if (
        existing?.status === 'ACTIVE' &&
        existing.emailVerifiedAt &&
        !existing.googleSubject &&
        (email.endsWith('@gmail.com') ||
          email.endsWith('@googlemail.com') ||
          profile.hd?.toLowerCase() === email.split('@')[1])
      ) {
        const link = await tx.user.updateMany({
          where: { id: existing.id, email, googleSubject: null, emailVerifiedAt: { not: null } },
          data: { googleSubject: profile.sub },
        })
        if (link.count) user = existing
      }
    }
    if (!user && enrollment && passwordHash && flow.policy === POLICY_VERSION) {
      if (!(await getSettings()).allowSignups) throw forbidden('Registration is closed.')
      if (await tx.user.findUnique({ where: { email }, select: { id: true } }))
        throw forbidden('Sign in with your password and link Google in account settings.')
      const name = profile.name?.trim().slice(0, 80) || 'Event guest'
      user = await tx.user.create({
        data: {
          email,
          googleSubject: profile.sub,
          passwordHash,
          emailVerifiedAt: new Date(),
          termsAcceptedAt: new Date(),
          termsVersion: flow.policy,
          profile: {
            create: { displayName: name, username: 'member-' + randomBytes(7).toString('hex') },
          },
        },
        select: { id: true, status: true, role: true },
      })
    }
    if (user?.status !== 'ACTIVE') throw forbidden('Sign-in is unavailable.')
    const claimed = await claimAdminInvitation(tx, user.id, email)
    if (flow.mode === 'admin' && user.role !== 'ADMIN' && !claimed)
      throw forbidden('Administrator access required.')
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    return createSession(tx, user.id, meta)
  })
}

export const googleRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/admin/mail-sender',
    {
      schema: {
        tags: ['Admin'],
        response: responses({
          200: z.object({
            address: z.email(),
            connected: z.boolean(),
            authorizedAt: z.date().nullable(),
            needsConsent: z.boolean(),
          }),
        }),
      },
    },
    async (req) => {
      requireAdmin(req)
      return senderStatus()
    },
  )
  app.get(
    '/auth/providers',
    {
      schema: {
        tags: ['Auth'],
        response: responses({ 200: z.object({ google: z.boolean(), emailDelivery: z.boolean(), accountEmail: z.boolean() }) }),
      },
    },
    async () => ({ google: enabled(), ...(await emailAvailability()) }),
  )
  app.post(
    '/auth/google/start',
    {
      config: { rateLimit: limits.auth },
      schema: {
        tags: ['Auth'],
        body: start,
        response: responses({ 200: z.object({ url: z.url() }) }),
      },
    },
    async (request, reply) => {
      if (!enabled()) throw badRequest('Google sign-in is unavailable.')
      if (request.body.mode === 'link' && !request.auth?.emailVerified)
        throw forbidden('Verify your email to link Google.')
      if (request.body.mode === 'sender') requireAdmin(request)
      const flow = {
        next:request.body.mode==='continue'?returnPath(request.body.next):undefined,
        state: oidc.randomState(),
        nonce: oidc.randomNonce(),
        verifier: oidc.randomPKCECodeVerifier(),
        expires: Date.now() + 600000,
        mode: request.body.mode,
        session: request.auth?.sessionId ?? null,
        policy:
          request.body.mode === 'register' || request.body.mode === 'continue'
            ? request.body.policyVersion
            : null,
      }
      reply.setCookie(
        flowCookie,
        signValue('google-flow', Buffer.from(JSON.stringify(flow)).toString('base64url')),
        { ...cookie, maxAge: 600 },
      )
      const url = oidc.buildAuthorizationUrl(await googleClient(), {
        redirect_uri: callback,
        response_type: 'code',
        scope: flow.mode === 'sender' ? 'openid email ' + sendScope : 'openid email profile',
        state: flow.state,
        nonce: flow.nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(flow.verifier),
        code_challenge_method: 'S256',
        ...(flow.mode === 'sender'
          ? { prompt: 'consent', access_type: 'offline', login_hint: senderAddress }
          : { prompt: 'select_account' }),
      })
      return { url: url.href }
    },
  )
  app.get(
    '/auth/google/callback',
    {
      config: { rateLimit: limits.auth },
      schema: {
        tags: ['Auth'],
        querystring: z.object({
          code: z.string().max(4096).optional(),
          state: z.string().max(512).optional(),
          error: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer')
      reply.clearCookie(flowCookie, cookie)
      let failurePath = '/auth/login?google=failed'
      try {
        const raw = verifySignedValue('google-flow', request.cookies[flowCookie] ?? '')
        if (!enabled() || !raw) throw new Error('incomplete')
        const flow = flowSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString()))
        if (
          flow.expires < Date.now() ||
          flow.state !== request.query.state ||
          flow.session !== (request.auth?.sessionId ?? null)
        )
          throw new Error('state')
        if (flow.mode === 'admin') failurePath = '/admin/auth/login?google=failed'
        if (flow.mode === 'sender') {
          requireAdmin(request)
          failurePath = '/admin/settings?sender=failed#email-sender'
        }
        if (!request.query.code) {
          if (flow.mode === 'sender' && request.query.error === 'access_denied')
            return reply.redirect(appUrl + '/admin/settings?sender=declined#email-sender')
          throw new Error('Google authorization did not complete.')
        }
        const currentUrl = new URL(callback)
        currentUrl.search = new URL(request.raw.url!, appUrl).search
        const tokens = await oidc.authorizationCodeGrant(await googleClient(), currentUrl, {
          expectedState: flow.state,
          expectedNonce: flow.nonce,
          pkceCodeVerifier: flow.verifier,
          idTokenExpected: true,
        })
        const profile = claims.parse(tokens.claims())
        if (flow.mode === 'sender') {
          if (profile.email.toLowerCase() !== senderAddress)
            return reply.redirect(appUrl + '/admin/settings?sender=wrong-account#email-sender')
          if (!tokens.scope?.split(' ').includes(sendScope))
            return reply.redirect(appUrl + '/admin/settings?sender=missing-permission#email-sender')
          if (!tokens.refresh_token)
            return reply.redirect(appUrl + '/admin/settings?sender=missing-offline-access#email-sender')
          await authorizeSender(tokens.access_token, tokens.refresh_token)
          return reply.redirect(appUrl + '/admin/settings?sender=connected#email-sender')
        }
        const session = await signIn(profile, flow, request)
        if (session)
          reply.setCookie(env.SESSION_COOKIE_NAME, session, {
            httpOnly: true,
            secure: env.COOKIE_SECURE,
            sameSite: 'lax',
            path: '/',
            maxAge: sessionMaxAgeSeconds,
            ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
          })
        return reply.redirect(
          appUrl +
            (flow.mode === 'link'
              ? '/dashboard/settings'
              : flow.mode === 'register'
                ? '/auth/welcome'
                : flow.mode === 'admin'
                  ? '/admin'
                  : (flow.next ?? '/dashboard')),
        )
      } catch {
        return reply.redirect(appUrl + failurePath)
      }
    },
  )
}
