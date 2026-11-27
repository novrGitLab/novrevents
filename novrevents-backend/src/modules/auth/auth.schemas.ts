import { z } from 'zod'
import { POLICY_VERSION } from '../../config/policy.js'
import { emailField, requiredText } from '../../lib/http.js'

/** Names that would collide with routes or impersonate the platform. */
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'cybernovr',
  'dashboard',
  'docs',
  'events',
  'explore',
  'f',
  'forms',
  'help',
  'login',
  'logout',
  'me',
  'moderator',
  'novr',
  'novrevents',
  'null',
  'organizer',
  'organizers',
  'privacy',
  'register',
  'root',
  'security',
  'settings',
  'staff',
  'support',
  'system',
  'terms',
  'u',
  'undefined',
  'verify',
  'www',
])

export const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/,
    'Use 3–30 characters: letters, numbers, hyphens or underscores.',
  )
  .refine((value) => !RESERVED_USERNAMES.has(value), 'That username is not available.')

export const passwordField = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'Use at most 200 characters.')

export const registerBody = z.object({
  email: emailField,
  password: passwordField,
  displayName: requiredText(2, 80),
  username: usernameField,
  /** Must be true: consent is never assumed. */
  acceptTerms: z.literal(true, {
    error: 'Please accept the Terms and Privacy Policy to continue.',
  }),
  /** The policy version the person was shown. Must be the current one. */
  policyVersion: z.literal(POLICY_VERSION, {
    error: 'The policy has changed. Reload the page and review it again.',
  }),
})

export const resendByEmailBody = z.object({ email: emailField })

const loginPassword = z.string().min(1).max(200)
export const loginBody = z.union([
  z.object({ identifier: z.union([emailField, usernameField]), password: loginPassword }).strict(),
  z.object({ email: emailField, password: loginPassword }),
])

export const tokenBody = z.object({ token: z.string().min(20).max(200) })

export const forgotPasswordBody = z.object({ email: emailField })

export const resetPasswordBody = z.object({
  token: z.string().min(20).max(200),
  password: passwordField,
})

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordField,
})

export const changeEmailBody = z.object({
  email: emailField,
  password: z.string().min(1).max(200),
})

export const sessionUserSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    emailVerified: z.boolean(),
    role: z.enum(['USER', 'ADMIN']),
    createdAt: z.date(),
    /** False until the person finishes or skips the one-time welcome. */
    onboarded: z.boolean(),
    profile: z.object({
      username: z.string(),
      displayName: z.string(),
      avatarUrl: z.string().nullable(),
    }),
  })
  .meta({ id: 'SessionUser' })

export const sessionResponse = z
  .object({
    authenticated: z.boolean(),
    user: sessionUserSchema.nullable(),
    /** Send as the `X-CSRF-Token` header on every state-changing request. */
    csrfToken: z.string().nullable(),
  })
  .meta({ id: 'Session' })

export const activeSessionSchema = z.object({
  id: z.uuid(),
  current: z.boolean(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.date(),
  lastUsedAt: z.date(),
  expiresAt: z.date(),
})
