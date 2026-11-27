import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'
import { prisma } from '../lib/db.js'
import { CONSENT, createTestApp, ORIGIN, uniqueEmail } from './helpers.js'

let app: FastifyInstance
const issuer = 'https://accounts.google.com'
const clientId = 'events-oidc-test.apps.googleusercontent.com'
const clientSecret = 'local-test-client-secret'
const original = { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET }
const key = generateKeyPairSync('rsa', { modulusLength: 2048 })
const email = uniqueEmail('google')
let authorization: URL
let exchanges = 0

beforeAll(async () => {
  env.GOOGLE_CLIENT_ID = clientId
  env.GOOGLE_CLIENT_SECRET = clientSecret
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    switch (new URL(url).pathname) {
      case '/.well-known/openid-configuration':
        return Response.json({
          issuer,
          authorization_endpoint: issuer + '/authorize',
          token_endpoint: issuer + '/token',
          jwks_uri: issuer + '/keys',
          id_token_signing_alg_values_supported: ['RS256'],
        })
      case '/keys':
        return Response.json({
          keys: [
            { ...key.publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' },
          ],
        })
      case '/token': {
        exchanges++
        const params = new URLSearchParams(String(init?.body))
        expect(params.get('client_secret')).toBe(clientSecret)
        expect(params.get('redirect_uri')).toBe(ORIGIN + '/api/v1/auth/google/callback')
        expect(createHash('sha256').update(params.get('code_verifier')!).digest('base64url')).toBe(
          authorization.searchParams.get('code_challenge'),
        )
        const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
        const time = Math.floor(Date.now() / 1000)
        const payload =
          encode({ alg: 'RS256', kid: 'test' }) +
          '.' +
          encode({
            iss: issuer,
            aud: clientId,
            sub: 'google-test-subject',
            iat: time,
            exp: time + 120,
            email,
            email_verified: true,
            name: 'Google test member',
            nonce: authorization.searchParams.get('nonce'),
          })
        return Response.json({
          access_token: 'local-test-token',
          token_type: 'Bearer',
          id_token:
            payload +
            '.' +
            sign('RSA-SHA256', Buffer.from(payload), key.privateKey).toString('base64url'),
        })
      }
      default:
        throw new Error('Unexpected OIDC endpoint')
    }
  })
  app = await createTestApp()
})

afterAll(async () => {
  vi.unstubAllGlobals()
  env.GOOGLE_CLIENT_ID = original.id
  env.GOOGLE_CLIENT_SECRET = original.secret
  await app.close()
})

async function begin(mode: 'register' | 'admin' | 'continue') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/google/start',
    headers: { origin: ORIGIN },
    payload: mode === 'admin' ? {mode} : { mode, ...CONSENT, ...(mode==='continue'?{next:'/dashboard/tickets'}:{}) },
  })
  expect(res.statusCode).toBe(200)
  authorization = new URL(res.json().url)
  expect(authorization.searchParams.get('client_id')).toBe(clientId)
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
  expect(authorization.searchParams.get('scope')?.split(' ')).toEqual(['openid','email','profile'])
  const cookie = res.cookies.find((entry) => entry.name === 'novr_google_flow')!
  return { [cookie.name]: cookie.value }
}

it('registers a verified invited Google identity and signs it into the admin portal', async () => {
  await prisma.adminAccessInvitation.create({
    data: { email, expiresAt: new Date(Date.now() + 60000) },
  })
  for (const mode of ['continue', 'continue', 'register', 'admin'] as const) {
    const cookies = await begin(mode)
    const callback = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/google/callback',
      query: { state: authorization.searchParams.get('state')!, code: 'local-code-' + mode },
      cookies,
    })
    expect(callback.headers.location).toBe(ORIGIN + (mode === 'admin' ? '/admin' : mode==='continue'?'/dashboard/tickets':'/auth/welcome'))
    expect(callback.cookies.some((c) => c.name === env.SESSION_COOKIE_NAME && c.httpOnly)).toBe(
      true,
    )
  }
  expect(exchanges).toBe(4)
  expect(await prisma.user.count({where:{email}})).toBe(1)
  expect(await prisma.user.findUnique({ where: { email } })).toMatchObject({
    role: 'ADMIN',
    termsVersion: CONSENT.policyVersion,
  })
})
