import { appUrl, env } from '../../config/env.js'
import {
  fakePasswordCheck,
  hashPassword,
  passwordNeedsRehash,
  randomToken,
  sha256,
  verifyPassword,
} from '../../lib/crypto.js'
import { isUniqueViolation, prisma, type Db } from '../../lib/db.js'
import { AppError, badRequest, conflict, forbidden } from '../../lib/errors.js'
import { publicFileUrl } from '../../lib/storage/index.js'
import type { AuthTokenType } from '../../generated/prisma/client.js'
import { getSettings } from '../admin/settings.service.js'
import { queueEmail } from '../communications/outbox.js'
import {
  accountNoticeContent,
  passwordResetContent,
  verifyEmailContent,
} from '../communications/templates.js'

const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const RESET_TTL_MS = 60 * 60 * 1000

/** A few of the most common passwords that still pass the length rule. */
const COMMON_PASSWORDS = new Set([
  'password123',
  'password1234',
  '1234567890',
  '12345678910',
  'qwertyuiop',
  'qwerty12345',
  'iloveyou123',
  'letmein12345',
  'administrator',
  'welcome12345',
  'changeme123',
  'passw0rd123',
])

export interface ClientMeta {
  ip: string
  userAgent: string | null
}

export const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.')

function assertPasswordAllowed(password: string, related: string[]): void {
  const lowered = password.toLowerCase()
  if (COMMON_PASSWORDS.has(lowered)) {
    throw badRequest('That password is too common. Choose a different one.', 'WEAK_PASSWORD')
  }
  if (related.some((value) => value.length >= 3 && lowered === value.toLowerCase())) {
    throw badRequest('Your password cannot be the same as your email or username.', 'WEAK_PASSWORD')
  }
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** Creates a session and returns the raw cookie token. Only its SHA-256 hash is stored. */
export async function createSession(db: Db, userId: string, meta: ClientMeta): Promise<string> {
  const token = randomToken(32)
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      ipAddress: meta.ip,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  return token
}

export const sessionMaxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)

export async function revokeSession(sessionId: string, userId: string): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return result.count > 0
}

export async function revokeAllSessions(
  db: Db,
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const result = await db.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  })
  return result.count
}

export async function listSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  })
}

export async function getSessionUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      onboardedAt: true,
      role: true,
      createdAt: true,
      profile: { select: { username: true, displayName: true, avatarKey: true } },
    },
  })
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    role: user.role,
    createdAt: user.createdAt,
    onboarded: user.onboardedAt !== null,
    profile: {
      username: user.profile?.username ?? '',
      displayName: user.profile?.displayName ?? '',
      avatarUrl: publicFileUrl(user.profile?.avatarKey),
    },
  }
}

// ─── One-time tokens ─────────────────────────────────────────────────────────

/** Issues a single-use token and invalidates earlier unused tokens of the same kind. */
async function issueAuthToken(
  db: Db,
  userId: string,
  type: AuthTokenType,
  ttlMs: number,
): Promise<string> {
  await db.authToken.deleteMany({ where: { userId, type, usedAt: null } })
  const token = randomToken(32)
  await db.authToken.create({
    data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
  })
  return token
}

/** Atomically marks a token as used. Returns the user id, or null if it is invalid or expired. */
async function consumeAuthToken(
  db: Db,
  token: string,
  type: AuthTokenType,
): Promise<string | null> {
  const record = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } })
  if (!record || record.type !== type || record.usedAt || record.expiresAt <= new Date())
    return null
  const claimed = await db.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  })
  return claimed.count === 1 ? record.userId : null
}

async function queueVerificationEmail(
  db: Db,
  user: { id: string; email: string },
  name: string,
): Promise<void> {
  const token = await issueAuthToken(db, user.id, 'EMAIL_VERIFICATION', VERIFICATION_TTL_MS)
  await queueEmail(db, {
    type: 'EMAIL_VERIFICATION',
    to: { email: user.email, name },
    userId: user.id,
    content: () => verifyEmailContent({ name, url: `${appUrl}/verify-email?token=${token}` }),
  })
}

// ─── Registration and login ──────────────────────────────────────────────────

export async function registerUser(
  input: {
    email: string
    password: string
    displayName: string
    username: string
    /** Consent is recorded only when the caller has explicitly accepted (enforced by the schema). */
    acceptTerms: true
    policyVersion: string
  },
  meta: ClientMeta,
): Promise<{ userId: string; sessionToken: string }> {
  const settings = await getSettings()
  if (!settings.allowSignups) {
    throw forbidden('New account registration is currently closed.', 'SIGNUPS_CLOSED')
  }
  assertPasswordAllowed(input.password, [input.email, input.username])
  const passwordHash = await hashPassword(input.password)

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          termsAcceptedAt: new Date(),
          termsVersion: input.policyVersion,
          profile: { create: { username: input.username, displayName: input.displayName } },
        },
        select: { id: true, email: true },
      })
      await queueVerificationEmail(tx, user, input.displayName)
      const sessionToken = await createSession(tx, user.id, meta)
      return { userId: user.id, sessionToken }
    })
  } catch (error) {
    if (isUniqueViolation(error, 'username')) {
      throw conflict('That username is already taken.', 'USERNAME_TAKEN')
    }
    if (isUniqueViolation(error)) {
      throw conflict('An account with this email already exists.', 'EMAIL_TAKEN')
    }
    throw error
  }
}

export async function authenticate(
  email: string,
  password: string,
  meta: ClientMeta,
): Promise<{ userId: string; sessionToken: string }> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, status: true },
  })
  if (!user) {
    // Spend the same time as a real check so timing does not reveal whether the account exists.
    await fakePasswordCheck()
    throw invalidCredentials()
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw invalidCredentials()
  if (user.status === 'SUSPENDED') {
    throw forbidden(
      'This account has been suspended. Contact support if you think this is a mistake.',
      'ACCOUNT_SUSPENDED',
    )
  }

  const rehash = passwordNeedsRehash(user.passwordHash) ? await hashPassword(password) : null
  const sessionToken = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(rehash ? { passwordHash: rehash } : {}) },
    })
    return createSession(tx, user.id, meta)
  })
  return { userId: user.id, sessionToken }
}

// ─── Email verification ──────────────────────────────────────────────────────

export async function resendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      profile: { select: { displayName: true } },
    },
  })
  if (user.emailVerifiedAt)
    throw conflict('Your email address is already verified.', 'ALREADY_VERIFIED')
  await prisma.$transaction((tx) =>
    queueVerificationEmail(tx, user, user.profile?.displayName ?? ''),
  )
}

/** Minimum time between verification emails for one account, so the public resend cannot be used to flood a mailbox. */
const RESEND_COOLDOWN_MS = 60 * 1000

/**
 * Unauthenticated resend for an expired or lost link. Always resolves the same way, whether or not the address
 * belongs to an unverified account, so it cannot be used to discover accounts. Sends nothing when the account
 * is already verified, suspended, or was emailed within the cooldown window.
 */
export async function requestVerificationByEmail(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      status: true,
      emailVerifiedAt: true,
      profile: { select: { displayName: true } },
    },
  })
  if (!user || user.status !== 'ACTIVE' || user.emailVerifiedAt) return
  const recent = await prisma.authToken.count({
    where: {
      userId: user.id,
      type: 'EMAIL_VERIFICATION',
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
  })
  if (recent > 0) return
  await prisma.$transaction((tx) =>
    queueVerificationEmail(tx, user, user.profile?.displayName ?? ''),
  )
}

/** Marks the one-time welcome as done. Idempotent: the first completion time is kept. */
export async function completeOnboarding(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, onboardedAt: null },
    data: { onboardedAt: new Date() },
  })
}

export async function verifyEmail(token: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const userId = await consumeAuthToken(tx, token, 'EMAIL_VERIFICATION')
    if (!userId)
      throw badRequest('This verification link is invalid or has expired.', 'INVALID_TOKEN')
    await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } })
    return userId
  })
}

// ─── Passwords ───────────────────────────────────────────────────────────────

/** Always resolves, whether or not the address is registered, so it cannot be used to probe accounts. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true, profile: { select: { displayName: true } } },
  })
  if (!user || user.status !== 'ACTIVE') return
  await prisma.$transaction(async (tx) => {
    const token = await issueAuthToken(tx, user.id, 'PASSWORD_RESET', RESET_TTL_MS)
    await queueEmail(tx, {
      type: 'PASSWORD_RESET',
      to: { email: user.email, name: user.profile?.displayName },
      userId: user.id,
      content: () =>
        passwordResetContent({
          name: user.profile?.displayName ?? '',
          url: `${appUrl}/reset-password?token=${token}`,
        }),
    })
  })
}

export async function resetPassword(token: string, password: string): Promise<string> {
  const passwordHash = await hashPassword(password)
  return prisma.$transaction(async (tx) => {
    const userId = await consumeAuthToken(tx, token, 'PASSWORD_RESET')
    if (!userId) throw badRequest('This reset link is invalid or has expired.', 'INVALID_TOKEN')
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, profile: { select: { username: true, displayName: true } } },
    })
    assertPasswordAllowed(password, [user.email, user.profile?.username ?? ''])
    // Possession of the mailbox was just proven, so the address counts as verified.
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, emailVerifiedAt: new Date() },
    })
    // A reset means the old password may be compromised: end every existing session.
    await revokeAllSessions(tx, userId)
    await queueEmail(tx, {
      type: 'ACCOUNT_NOTICE',
      to: { email: user.email, name: user.profile?.displayName },
      userId,
      content: () =>
        accountNoticeContent({
          name: user.profile?.displayName ?? '',
          subject: 'Your password was changed',
          message:
            'The password for your NOVR Events account was just reset, and all devices were signed out.',
        }),
    })
    return userId
  })
}

export async function changePassword(
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      passwordHash: true,
      profile: { select: { username: true, displayName: true } },
    },
  })
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw badRequest('Your current password is incorrect.', 'INVALID_PASSWORD')
  }
  assertPasswordAllowed(newPassword, [user.email, user.profile?.username ?? ''])
  const passwordHash = await hashPassword(newPassword)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } })
    await revokeAllSessions(tx, userId, currentSessionId)
    await queueEmail(tx, {
      type: 'ACCOUNT_NOTICE',
      to: { email: user.email, name: user.profile?.displayName },
      userId,
      content: () =>
        accountNoticeContent({
          name: user.profile?.displayName ?? '',
          subject: 'Your password was changed',
          message:
            'The password for your NOVR Events account was just changed, and other devices were signed out.',
        }),
    })
  })
}

/** Changing the address needs the password, resets verification, and tells the old address. */
export async function changeEmail(
  userId: string,
  newEmail: string,
  password: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      profile: { select: { displayName: true } },
    },
  })
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw badRequest('Your password is incorrect.', 'INVALID_PASSWORD')
  }
  if (newEmail === user.email) throw badRequest('That is already your email address.')
  const name = user.profile?.displayName ?? ''
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { email: newEmail, emailVerifiedAt: null },
      })
      await queueVerificationEmail(tx, { id: userId, email: newEmail }, name)
      await queueEmail(tx, {
        type: 'ACCOUNT_NOTICE',
        to: { email: user.email, name },
        userId,
        content: () =>
          accountNoticeContent({
            name,
            subject: 'Your email address was changed',
            message: `The email address on your NOVR Events account was changed to ${newEmail}.`,
          }),
      })
    })
  } catch (error) {
    if (isUniqueViolation(error))
      throw conflict('An account with this email already exists.', 'EMAIL_TAKEN')
    throw error
  }
}
