import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
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

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
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
  mode: z.enum(['login', 'register', 'link']),
  session: z.string().nullable(),
  policy: z.string().nullable(),
})
const enabled = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
const random = () => randomBytes(32).toString('base64url')
const start = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('login') }),
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
  name: z.string().optional(),
})

async function signIn(
  profile: z.infer<typeof claims>,
  flow: z.infer<typeof flowSchema>,
  request: FastifyRequest,
) {
  const email = profile.email.trim().toLowerCase()
  const meta = { ip: request.ip, userAgent: request.headers['user-agent'] ?? null }
  if (flow.mode === 'register' && !(await getSettings()).allowSignups)
    throw forbidden('Registration is closed.')
  const passwordHash = flow.mode === 'register' ? await hashPassword(random()) : null
  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: { googleSubject: profile.sub },
      select: { id: true, status: true },
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
    if (!user && flow.mode === 'register' && passwordHash && flow.policy === POLICY_VERSION) {
      if (await tx.user.findUnique({ where: { email }, select: { id: true } }))
        throw forbidden('Sign in with your password and link Google in account settings.')
      const name = profile.name?.trim().slice(0, 80) || email.split('@')[0]!.slice(0, 80)
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
        select: { id: true, status: true },
      })
    }
    if (user?.status !== 'ACTIVE') throw forbidden('Sign-in is unavailable.')
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    return createSession(tx, user.id, meta)
  })
}

export const googleRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/auth/providers',
    { schema: { tags: ['Auth'], response: responses({ 200: z.object({ google: z.boolean() }) }) } },
    async () => ({ google: enabled() }),
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
      const flow = {
        state: random(),
        nonce: random(),
        verifier: random(),
        expires: Date.now() + 600000,
        mode: request.body.mode,
        session: request.auth?.sessionId ?? null,
        policy: request.body.mode === 'register' ? request.body.policyVersion : null,
      }
      reply.setCookie(
        flowCookie,
        signValue('google-flow', Buffer.from(JSON.stringify(flow)).toString('base64url')),
        { ...cookie, maxAge: 600 },
      )
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID!,
        redirect_uri: callback,
        response_type: 'code',
        scope: 'openid email profile',
        state: flow.state,
        nonce: flow.nonce,
        code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'),
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString()
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
      try {
        const raw = verifySignedValue('google-flow', request.cookies[flowCookie] ?? '')
        if (!enabled() || !raw || !request.query.code) throw new Error('incomplete')
        const flow = flowSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString()))
        if (
          flow.expires < Date.now() ||
          flow.state !== request.query.state ||
          flow.session !== (request.auth?.sessionId ?? null)
        )
          throw new Error('state')
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          signal: AbortSignal.timeout(10000),
          body: new URLSearchParams({
            code: request.query.code,
            client_id: env.GOOGLE_CLIENT_ID!,
            client_secret: env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: callback,
            grant_type: 'authorization_code',
            code_verifier: flow.verifier,
          }),
        })
        if (!response.ok) throw new Error('exchange')
        const { id_token } = z.object({ id_token: z.string() }).parse(await response.json())
        const token = await jwtVerify(id_token, googleKeys, {
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
          audience: env.GOOGLE_CLIENT_ID!,
          algorithms: ['RS256'],
          requiredClaims: ['iat', 'exp', 'sub'],
        })
        const profile = claims.parse(token.payload)
        if (profile.nonce !== flow.nonce) throw new Error('nonce')
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
                : '/dashboard'),
        )
      } catch {
        return reply.redirect(appUrl + '/auth/login?google=failed')
      }
    },
  )
}
