import { z } from 'zod'
import { type Prisma, prisma } from '../../lib/db.js'

/**
 * Platform configuration, editable by administrators. Each key is stored as one row in
 * `system_settings`; a key with no row uses the default below.
 */
export const settingsSchema = z.object({
  /** Allow new accounts to be created. */
  allowSignups: z.boolean(),
  /** Require a verified email before a user can publish events or forms, or send email. */
  requireVerifiedEmailToPublish: z.boolean(),
  /** Number of open reports from distinct reporters that flags an event for moderator review. */
  reportFlagThreshold: z.number().int().min(1).max(100),
  /** Maximum events one user may publish in any 24-hour period. */
  maxEventsPublishedPerDay: z.number().int().min(1).max(500),
  /** Maximum invitation emails (speaker/volunteer) one event may send in any 24-hour period. */
  maxInvitationsPerEventPerDay: z.number().int().min(0).max(2000),
  /** Contact address shown on the public site for support and abuse reports. Empty hides it. */
  supportEmail: z.union([z.email(), z.literal('')]),
})

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  allowSignups: true,
  requireVerifiedEmailToPublish: true,
  reportFlagThreshold: 3,
  maxEventsPublishedPerDay: 10,
  maxInvitationsPerEventPerDay: 100,
  supportEmail: '',
}

const CACHE_TTL_MS = 15_000
let cache: { value: Settings; expiresAt: number } | null = null

export async function getSettings(): Promise<Settings> {
  if (cache && cache.expiresAt > Date.now()) return cache.value
  const rows = await prisma.systemSetting.findMany()
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  // Invalid or unknown stored values fall back to the default rather than breaking the platform.
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    if (!(key in stored)) continue
    const parsed = settingsSchema.shape[key].safeParse(stored[key])
    if (parsed.success) merged[key] = parsed.data
  }
  const value = merged as Settings
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export async function updateSettings(
  patch: Partial<Settings>,
  updatedById: string,
): Promise<Settings> {
  await prisma.$transaction(
    Object.entries(patch).map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedById },
        update: { value: value as Prisma.InputJsonValue, updatedById },
      }),
    ),
  )
  cache = null
  return getSettings()
}

/** Test helper: forget cached values. */
export function clearSettingsCache(): void {
  cache = null
}
