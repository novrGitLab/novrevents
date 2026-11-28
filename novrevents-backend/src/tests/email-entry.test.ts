import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { solveChallenge } from 'altcha-lib'
import { prisma } from '../lib/db.js'
import {
  authorizeSender,
  gmailApiProvider,
  senderAddress,
  senderStatus,
} from '../lib/email/google-sender.js'
import { humanChallenge } from '../modules/auth/email-entry.js'
import { CONSENT, createTestApp, PASSWORD, TestClient, uniqueEmail } from './helpers.js'

let app: FastifyInstance
beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
afterEach(() => vi.unstubAllGlobals())
async function emailCode(client: TestClient, email: string) {
  const challenge = await humanChallenge()
  const solution = await solveChallenge({ challenge, deriveKey })
  const captcha = Buffer.from(JSON.stringify({ challenge, solution })).toString('base64')
  const sent = await client.post<{ challengeId: string }>('/api/v1/auth/entry', { email, captcha })
  expect(sent.status).toBe(200)
  const message = await prisma.message.findFirstOrThrow({
    where: { toEmail: email },
    orderBy: { createdAt: 'desc' },
  })
  const code = message.bodyText.match(/(?:^|\n)\s*(\d{6})\s*(?:\n|$)/)?.[1]
  expect(code).toBeTruthy()
  return { challengeId: sent.body.challengeId, code, captcha }
}
describe('email account entry', () => {
  it('verifies ownership before password setup and signs returning members in with a new code', async () => {
    const client = new TestClient(app),
      email = uniqueEmail()
    const issued = await emailCode(client, email)
    expect(
      (await client.post('/api/v1/auth/entry', { email: uniqueEmail(), captcha: issued.captcha }))
        .status,
    ).toBe(400)
    const proof = await client.post<{ step: string; proof: string }>(
      '/api/v1/auth/entry/verify',
      issued,
    )
    expect(proof.body.step).toBe('password')
    const body = { email, password: PASSWORD, proof: proof.body.proof, ...CONSENT }
    expect((await client.post('/api/v1/auth/entry/finish', body)).status).toBe(200)
    expect((await new TestClient(app).post('/api/v1/auth/entry/finish', body)).status).toBe(400)
    const returning = new TestClient(app)
    const again = await emailCode(returning, email)
    const result = await returning.post<{ step: string; session: { user: { email: string } } }>(
      '/api/v1/auth/entry/verify',
      again,
    )
    expect(result.body.step).toBe('signed-in')
    expect(result.body.session.user.email).toBe(email)
    expect((await new TestClient(app).post('/api/v1/auth/entry/verify', again)).status).toBe(400)
  })
  it('requires proof on the older registration endpoint and limits verification attempts', async () => {
    const client = new TestClient(app),
      email = uniqueEmail()
    expect(
      (
        await client.post('/api/v1/auth/register', {
          email,
          password: PASSWORD,
          username: 'test-person',
          displayName: 'Test Person',
          ...CONSENT,
        })
      ).status,
    ).toBe(400)
    const { challengeId, code } = await emailCode(client, email)
    for (let i = 0; i < 3; i++)
      expect(
        (
          await client.post('/api/v1/auth/entry/verify', {
            challengeId,
            code: code === '999999' ? '000000' : '999999',
          })
        ).status,
      ).toBe(400)
    expect((await client.post('/api/v1/auth/entry/verify', { challengeId, code })).status).toBe(400)
  })
})
describe('Gmail sender', () => {
  it('preserves the working sender if a replacement fails its delivery check', async () => {
    await prisma.mailSender.deleteMany({ where: { address: senderAddress } })
    const gmail = vi.fn()
    vi.stubGlobal('fetch', gmail)
    try {
      gmail.mockResolvedValueOnce(Response.json({ id: 'accepted-test-message' }))
      await authorizeSender('first-access', 'first-refresh')
      const previous = await prisma.mailSender.findUniqueOrThrow({ where: { address: senderAddress } })
      gmail.mockResolvedValueOnce(new Response(null, { status: 403 }))
      await expect(authorizeSender('other-access', 'other-refresh')).rejects.toThrow('403')
      expect(await prisma.mailSender.findUniqueOrThrow({ where: { address: senderAddress } })).toEqual(previous)
    } finally {
      await prisma.mailSender.deleteMany({ where: { address: senderAddress } })
    }
  })
  it('encrypts the refresh grant, preserves the PDF attachment and marks a revoked grant for reconnection', async () => {
    await prisma.mailSender.deleteMany({ where: { address: senderAddress } })
    const messages: string[] = []
    let revoked = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url === 'https://oauth2.googleapis.com/token')
          return Response.json(
            revoked ? { error: 'invalid_grant' } : { access_token: 'test-access' },
            { status: revoked ? 400 : 200 },
          )
        expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
        messages.push(Buffer.from(JSON.parse(String(init.body)).raw, 'base64url').toString())
        return Response.json({ id: 'message-accepted' })
      }),
    )
    try {
      await authorizeSender('test-access', 'test-refresh')
      const row = await prisma.mailSender.findUniqueOrThrow({ where: { address: senderAddress } })
      expect(row.credential).not.toContain('test-refresh')
      const mail = {
        to: { email: 'guest@example.test' },
        subject: 'Your event ticket',
        text: 'Your admission ticket is attached.',
        html: '<p>Your admission ticket is attached.</p>',
        attachments: [{ filename: 'ticket.pdf', content: Buffer.from('%PDF-1.4') }],
      }
      await gmailApiProvider.send(mail)
      expect(messages[1]).toContain('application/pdf')
      expect(messages[1]).toContain('ticket.pdf')
      expect(messages[1]).toContain('To: guest@example.test')
      revoked = true
      await expect(gmailApiProvider.send(mail)).rejects.toThrow('authorization')
      expect((await senderStatus()).connected).toBe(false)
    } finally {
      await prisma.mailSender.deleteMany({ where: { address: senderAddress } })
    }
  })
})
