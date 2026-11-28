import { consumeEntryProof } from './entry-proof.js'
import { randomInt, randomUUID } from 'node:crypto'
import { createChallenge, verifySolution } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { z } from 'zod'
import { POLICY_VERSION } from '../../config/policy.js'
import { hashPassword, hmac, randomToken, safeEqual, sha256 } from '../../lib/crypto.js'
import { prisma } from '../../lib/db.js'
import { AppError, badRequest, forbidden } from '../../lib/errors.js'
import { queueEmail } from '../communications/outbox.js'
import { emailAvailability } from '../../lib/email/google-sender.js'
import { getSettings } from '../admin/settings.service.js'
import { claimAdminInvitation } from './admin-invitation.js'
import { assertPasswordAllowed, createSession, type ClientMeta } from './auth.service.js'

const captchaKeys = () => ({
  hmacSignatureSecret: hmac('captcha', 'signature'),
  hmacKeySignatureSecret: hmac('captcha', 'derived-key'),
})
const invalidCode = () => badRequest('This code is incorrect or has expired.', 'INVALID_CODE')
const invalidCaptcha = () => badRequest('Complete the human check again.', 'INVALID_CAPTCHA')
const signedChallenge = z.object({
  parameters: z
    .object({
      algorithm: z.literal('PBKDF2/SHA-256'),
      nonce: z.string().max(256),
      salt: z.string().max(256),
      cost: z.literal(1000),
      keyLength: z.number().int().max(64),
      keyPrefix: z.string().max(128),
      keySignature: z.string().max(256),
      expiresAt: z.number().int(),
    })
    .passthrough(),
  signature: z.string().min(20).max(256),
})
export async function humanChallenge() {
  await Promise.all([
    prisma.humanChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.emailEntry.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
  ])
  return createChallenge({
    algorithm: 'PBKDF2/SHA-256',
    cost: 1000,
    counter: randomInt(800, 2400),
    expiresAt: new Date(Date.now() + 5 * 60000),
    deriveKey,
    ...captchaKeys(),
  })
}
async function validateHuman(payload: string) {
  try {
    const decoded = z
      .object({
        challenge: signedChallenge,
        solution: z.object({
          counter: z.number().int().min(0).max(2400),
          derivedKey: z.string().max(256),
        }),
      })
      .parse(JSON.parse(Buffer.from(payload, 'base64').toString('utf8')))
    const result = await verifySolution({ ...decoded, deriveKey, ...captchaKeys() })
    if (!result.verified) throw invalidCaptcha()
    return {
      id: sha256(decoded.challenge.signature),
      expiresAt: new Date(decoded.challenge.parameters.expiresAt * 1000),
    }
  } catch {
    throw invalidCaptcha()
  }
}
export async function requestEntry(email: string, payload: string) {
  if (!(await emailAvailability()).accountEmail)
    throw new AppError(
      503,
      'EMAIL_UNAVAILABLE',
      'Email codes are unavailable. Continue with Google or use your password.',
    )
  const human = await validateHuman(payload)
  const challengeId = randomUUID()
  const code = randomInt(0, 1000000).toString().padStart(6, '0')
  return prisma.$transaction(async (tx) => {
    const used = await tx.humanChallenge.createMany({ data: [human], skipDuplicates: true })
    if (!used.count) throw invalidCaptcha()
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${email}, 0))`
    const previous = await tx.emailEntry.findUnique({ where: { email } })
    if (previous && previous.sentAt.getTime() > Date.now() - 60_000)
      throw new AppError(429, 'CODE_COOLDOWN', 'Wait a minute before requesting another code.')
    const data = {
      challengeId,
      codeHash: hmac('entry-code', challengeId + code),
      proofHash: null,
      attempts: 0,
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 600000),
    }
    await tx.emailEntry.upsert({ where: { email }, create: { email, ...data }, update: data })
    await queueEmail(tx, {
      type: 'EMAIL_VERIFICATION',
      to: { email },
      content: () => ({
        subject: 'Your NovrEvents sign-in code',
        heading: 'Confirm your email',
        blocks: [
          {
            kind: 'text',
            text: 'Enter this code in the NovrEvents window where you requested it.',
          },
          { kind: 'text', text: code },
          {
            kind: 'note',
            text: 'This code expires in ten minutes. If you did not request it, you can ignore this email.',
          },
        ],
      }),
    })
    return { challengeId }
  })
}
export async function checkEntry(challengeId: string, code: string, meta: ClientMeta) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT email FROM email_entries WHERE challenge_id=${challengeId}::uuid FOR UPDATE`
    const row = await tx.emailEntry.findUnique({ where: { challengeId } })
    if (!row || row.expiresAt <= new Date() || row.attempts >= 3 || row.proofHash) return null
    if (!safeEqual(row.codeHash, hmac('entry-code', challengeId + code))) {
      await tx.emailEntry.update({ where: { challengeId }, data: { attempts: { increment: 1 } } })
      return null
    }
    const user = await tx.user.findUnique({ where: { email: row.email } })
    if (user && user.status !== 'ACTIVE') throw forbidden('Account access is unavailable.')
    if (user?.emailVerifiedAt) {
      await tx.emailEntry.delete({ where: { challengeId } })
      await claimAdminInvitation(tx, user.id, row.email)
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      return { userId: user.id, sessionToken: await createSession(tx, user.id, meta) }
    }
    const proof = randomToken()
    await tx.emailEntry.update({
      where: { challengeId },
      data: { proofHash: sha256(proof), expiresAt: new Date(Date.now() + 600000) },
    })
    return { proof }
  })
  if (!result) throw invalidCode()
  return result
}
export async function finishEntry(
  email: string,
  proof: string,
  password: string,
  meta: ClientMeta,
) {
  assertPasswordAllowed(password, [email, email.split('@')[0]!])
  const hash = await hashPassword(password)
  return prisma.$transaction(async (tx) => {
    await consumeEntryProof(tx, email, proof)
    const previous = await tx.user.findUnique({ where: { email } })
    if (previous && (previous.status !== 'ACTIVE' || previous.emailVerifiedAt))
      throw forbidden('Please start sign-in again.')
    if (!previous && !(await getSettings()).allowSignups) throw forbidden('Registration is closed.')
    const data = {
      passwordHash: hash,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      termsVersion: POLICY_VERSION,
      lastLoginAt: new Date(),
    }
    const user = previous
      ? await tx.user.update({ where: { id: previous.id }, data })
      : await tx.user.create({
          data: {
            email,
            ...data,
            profile: {
              create: {
                username:
                  'member-' +
                  randomToken(9)
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, 'x'),
                displayName: 'Event guest',
              },
            },
          },
        })
    if (previous) {
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      await tx.authToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      })
    }
    await claimAdminInvitation(tx, user.id, email)
    return { userId: user.id, sessionToken: await createSession(tx, user.id, meta) }
  })
}
