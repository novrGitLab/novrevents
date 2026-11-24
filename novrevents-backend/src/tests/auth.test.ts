import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../lib/db.js'
import {
  CONSENT,
  createTestApp,
  createUser,
  errorCode,
  latestEmailToken,
  PASSWORD,
  TestClient,
  uniqueEmail,
  uniqueUsername,
} from './helpers.js'

interface SessionBody {
  authenticated: boolean
  user: {
    id: string
    email: string
    emailVerified: boolean
    role: string
    profile: { username: string }
  } | null
  csrfToken: string | null
}

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})

afterAll(async () => {
  await app.close()
})

describe('registration', () => {
  it('creates an account, a profile and an HTTP-only session cookie', async () => {
    const client = new TestClient(app)
    const email = uniqueEmail()
    const username = uniqueUsername()
    const response = await client.post<SessionBody>('/api/v1/auth/register', {
      ...CONSENT,
      email: email.toUpperCase(),
      username,
      displayName: 'Ada Example',
      password: PASSWORD,
    })

    expect(response.status).toBe(201)
    expect(response.body.authenticated).toBe(true)
    expect(response.body.user).toMatchObject({ email, emailVerified: false, role: 'USER' })
    expect(response.body.user?.profile.username).toBe(username)
    expect(response.body.csrfToken).toEqual(expect.any(String))
    // The response must never contain credential material.
    expect(JSON.stringify(response.body)).not.toMatch(/password|tokenHash/i)

    const setCookie = String(response.headers['set-cookie'])
    expect(setCookie).toContain('novr_session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } })
    expect(stored.passwordHash.startsWith('scrypt$')).toBe(true)
    expect(stored.passwordHash).not.toContain(PASSWORD)

    const session = await client.get<SessionBody>('/api/v1/auth/session')
    expect(session.body.authenticated).toBe(true)
    expect(session.body.user?.id).toBe(response.body.user?.id)
  })

  it('stores only a hash of the session token', async () => {
    const user = await createUser(app)
    const sessions = await prisma.session.findMany({ where: { userId: user.id } })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.tokenHash).not.toBe(user.client.sessionCookie)
    expect(sessions[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects a duplicate email and a duplicate username', async () => {
    const existing = await createUser(app)
    const client = new TestClient(app)

    const sameEmail = await client.post('/api/v1/auth/register', {
      ...CONSENT,
      email: existing.email,
      username: uniqueUsername(),
      displayName: 'Someone Else',
      password: PASSWORD,
    })
    expect(sameEmail.status).toBe(409)
    expect(errorCode(sameEmail)).toBe('EMAIL_TAKEN')

    const sameUsername = await client.post('/api/v1/auth/register', {
      ...CONSENT,
      email: uniqueEmail(),
      username: existing.username,
      displayName: 'Someone Else',
      password: PASSWORD,
    })
    expect(sameUsername.status).toBe(409)
    expect(errorCode(sameUsername)).toBe('USERNAME_TAKEN')
  })

  it('validates input on the server', async () => {
    const client = new TestClient(app)
    const short = await client.post('/api/v1/auth/register', {
      ...CONSENT,
      email: 'not-an-email',
      username: 'ab',
      displayName: 'X',
      password: 'short',
    })
    expect(short.status).toBe(400)
    expect(errorCode(short)).toBe('VALIDATION_ERROR')
    const paths = (short.body as { error: { details: Array<{ path: string }> } }).error.details.map(
      (d) => d.path,
    )
    expect(paths).toEqual(expect.arrayContaining(['body.email', 'body.username', 'body.password']))

    const reserved = await client.post('/api/v1/auth/register', {
      ...CONSENT,
      email: uniqueEmail(),
      username: 'admin',
      displayName: 'Admin Wannabe',
      password: PASSWORD,
    })
    expect(reserved.status).toBe(400)

    const common = await client.post('/api/v1/auth/register', {
      ...CONSENT,
      email: uniqueEmail(),
      username: uniqueUsername(),
      displayName: 'Weak Password',
      password: 'password123',
    })
    expect(common.status).toBe(400)
    expect(errorCode(common)).toBe('WEAK_PASSWORD')
  })
})

describe('login and logout', () => {
  it('signs in with correct credentials and rejects wrong ones identically', async () => {
    const user = await createUser(app)
    const client = new TestClient(app)

    const wrongPassword = await client.post('/api/v1/auth/login', {
      email: user.email,
      password: 'wrong-password-1',
    })
    const unknownEmail = await client.post('/api/v1/auth/login', {
      email: uniqueEmail(),
      password: PASSWORD,
    })
    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    // Same code and message, so the response does not reveal which accounts exist.
    expect(wrongPassword.body).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } })
    expect((unknownEmail.body as { error: { message: string } }).error.message).toBe(
      (wrongPassword.body as { error: { message: string } }).error.message,
    )
    expect(client.sessionCookie).toBeNull()

    const ok = await client.post<SessionBody>('/api/v1/auth/login', {
      email: user.email,
      password: PASSWORD,
    })
    expect(ok.status).toBe(200)
    expect(ok.body.user?.id).toBe(user.id)
    expect(client.sessionCookie).toEqual(expect.any(String))
  })

  it('invalidates the session on logout', async () => {
    const user = await createUser(app)
    const stolenCookie = user.client.sessionCookie

    const logout = await user.client.post('/api/v1/auth/logout')
    expect(logout.status).toBe(200)
    expect(user.client.sessionCookie).toBeNull()

    // Replaying the old cookie must not work: the session is revoked server-side.
    const replay = new TestClient(app)
    replay.setSessionCookie(stolenCookie)
    const session = await replay.get<SessionBody>('/api/v1/auth/session')
    expect(session.body.authenticated).toBe(false)
  })

  it('requires authentication for protected endpoints', async () => {
    const anonymous = new TestClient(app)
    const response = await anonymous.get('/api/v1/auth/sessions')
    expect(response.status).toBe(401)
    expect(errorCode(response)).toBe('UNAUTHORIZED')
  })

  it('blocks suspended accounts and ends their sessions', async () => {
    const user = await createUser(app)
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'SUSPENDED', suspendedAt: new Date() },
    })

    const existing = await user.client.get<SessionBody>('/api/v1/auth/session')
    expect(existing.body.authenticated).toBe(false)

    const login = await new TestClient(app).post('/api/v1/auth/login', {
      email: user.email,
      password: PASSWORD,
    })
    expect(login.status).toBe(403)
    expect(errorCode(login)).toBe('ACCOUNT_SUSPENDED')
  })
})

describe('CSRF protection', () => {
  it('rejects a state-changing request without the session CSRF token', async () => {
    const user = await createUser(app)
    const response = await user.client.post('/api/v1/auth/sessions/revoke-others', undefined, {
      csrf: false,
    })
    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('CSRF_FAILED')
  })

  it('rejects a token that belongs to another session', async () => {
    const victim = await createUser(app)
    const attacker = await createUser(app)
    victim.client.csrfToken = attacker.client.csrfToken
    const response = await victim.client.post('/api/v1/auth/sessions/revoke-others')
    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('CSRF_FAILED')
  })

  it('rejects state-changing requests from an origin that is not allowed', async () => {
    const user = await createUser(app)
    const response = await user.client.post('/api/v1/auth/logout', undefined, {
      origin: 'https://evil.example',
    })
    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('CSRF_FAILED')
    // The session is still alive: the forged request did nothing.
    const session = await user.client.get<SessionBody>('/api/v1/auth/session')
    expect(session.body.authenticated).toBe(true)
  })

  it('accepts the request when the token and origin are valid', async () => {
    const user = await createUser(app)
    const response = await user.client.post('/api/v1/auth/sessions/revoke-others')
    expect(response.status).toBe(200)
  })
})

describe('email verification', () => {
  it('verifies the address with the emailed single-use token', async () => {
    const user = await createUser(app, { verified: false })
    const token = await latestEmailToken(user.email, 'EMAIL_VERIFICATION')

    const verify = await new TestClient(app).post('/api/v1/auth/verify-email', { token })
    expect(verify.status).toBe(200)

    const session = await user.client.get<SessionBody>('/api/v1/auth/session')
    expect(session.body.user?.emailVerified).toBe(true)

    const reuse = await new TestClient(app).post('/api/v1/auth/verify-email', { token })
    expect(reuse.status).toBe(400)
    expect(errorCode(reuse)).toBe('INVALID_TOKEN')
  })

  it('rejects an expired token', async () => {
    const user = await createUser(app, { verified: false })
    const token = await latestEmailToken(user.email, 'EMAIL_VERIFICATION')
    await prisma.authToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const response = await new TestClient(app).post('/api/v1/auth/verify-email', { token })
    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('INVALID_TOKEN')
  })

  it('re-sends a verification link and invalidates the previous one', async () => {
    const user = await createUser(app, { verified: false })
    const first = await latestEmailToken(user.email, 'EMAIL_VERIFICATION')
    const resend = await user.client.post('/api/v1/auth/resend-verification')
    expect(resend.status).toBe(200)
    const second = await latestEmailToken(user.email, 'EMAIL_VERIFICATION')
    expect(second).not.toBe(first)

    const stale = await new TestClient(app).post('/api/v1/auth/verify-email', { token: first })
    expect(stale.status).toBe(400)
    const fresh = await new TestClient(app).post('/api/v1/auth/verify-email', { token: second })
    expect(fresh.status).toBe(200)
  })
})

describe('password reset and change', () => {
  it('does not reveal whether an address is registered', async () => {
    const unknown = uniqueEmail('ghost')
    const response = await new TestClient(app).post('/api/v1/auth/forgot-password', {
      email: unknown,
    })
    expect(response.status).toBe(200)
    expect(await prisma.message.count({ where: { toEmail: unknown } })).toBe(0)
  })

  it('resets the password, signs out every session and allows a single use of the token', async () => {
    const user = await createUser(app)
    const secondDevice = new TestClient(app)
    await secondDevice.post('/api/v1/auth/login', { email: user.email, password: PASSWORD })

    const forgot = await new TestClient(app).post('/api/v1/auth/forgot-password', {
      email: user.email,
    })
    expect(forgot.status).toBe(200)
    const token = await latestEmailToken(user.email, 'PASSWORD_RESET')

    const newPassword = 'a-brand-new-passphrase-42'
    const reset = await new TestClient(app).post('/api/v1/auth/reset-password', {
      token,
      password: newPassword,
    })
    expect(reset.status).toBe(200)

    for (const client of [user.client, secondDevice]) {
      const session = await client.get<SessionBody>('/api/v1/auth/session')
      expect(session.body.authenticated).toBe(false)
    }

    const oldLogin = await new TestClient(app).post('/api/v1/auth/login', {
      email: user.email,
      password: PASSWORD,
    })
    expect(oldLogin.status).toBe(401)
    const newLogin = await new TestClient(app).post('/api/v1/auth/login', {
      email: user.email,
      password: newPassword,
    })
    expect(newLogin.status).toBe(200)

    const reuse = await new TestClient(app).post('/api/v1/auth/reset-password', {
      token,
      password: 'another-passphrase-77',
    })
    expect(reuse.status).toBe(400)
    expect(errorCode(reuse)).toBe('INVALID_TOKEN')
  })

  it('changes the password only with the current one and signs out other devices', async () => {
    const user = await createUser(app)
    const otherDevice = new TestClient(app)
    await otherDevice.post('/api/v1/auth/login', { email: user.email, password: PASSWORD })

    const wrong = await user.client.post('/api/v1/auth/change-password', {
      currentPassword: 'not-the-password',
      newPassword: 'another-long-passphrase-9',
    })
    expect(wrong.status).toBe(400)
    expect(errorCode(wrong)).toBe('INVALID_PASSWORD')

    const ok = await user.client.post('/api/v1/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'another-long-passphrase-9',
    })
    expect(ok.status).toBe(200)

    expect((await user.client.get<SessionBody>('/api/v1/auth/session')).body.authenticated).toBe(
      true,
    )
    expect((await otherDevice.get<SessionBody>('/api/v1/auth/session')).body.authenticated).toBe(
      false,
    )
  })
})

describe('session management', () => {
  it('lists sessions and revokes one without affecting the current session', async () => {
    const user = await createUser(app)
    const otherDevice = new TestClient(app)
    await otherDevice.post('/api/v1/auth/login', { email: user.email, password: PASSWORD })

    const list = await user.client.get<{ items: Array<{ id: string; current: boolean }> }>(
      '/api/v1/auth/sessions',
    )
    expect(list.status).toBe(200)
    expect(list.body.items).toHaveLength(2)
    const other = list.body.items.find((session) => !session.current)
    expect(other).toBeDefined()

    const revoke = await user.client.delete(`/api/v1/auth/sessions/${other?.id}`)
    expect(revoke.status).toBe(200)
    expect((await otherDevice.get<SessionBody>('/api/v1/auth/session')).body.authenticated).toBe(
      false,
    )
    expect((await user.client.get<SessionBody>('/api/v1/auth/session')).body.authenticated).toBe(
      true,
    )
  })

  it("cannot revoke another user's session", async () => {
    const alice = await createUser(app)
    const bob = await createUser(app)
    const bobSession = await prisma.session.findFirstOrThrow({ where: { userId: bob.id } })
    const response = await alice.client.delete(`/api/v1/auth/sessions/${bobSession.id}`)
    expect(response.status).toBe(404)
    expect((await bob.client.get<SessionBody>('/api/v1/auth/session')).body.authenticated).toBe(
      true,
    )
  })
})
