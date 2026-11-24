import { prisma } from '../lib/db.js'
import { applyRetention } from '../modules/submissions/submission.service.js'

/**
 * Moves stored event statuses forward in time: PUBLISHED → ONGOING → COMPLETED. Pages already
 * derive the live status, so this only keeps stored data, filters and reports accurate.
 */
export async function syncEventStatuses(
  now: Date = new Date(),
): Promise<{ ongoing: number; completed: number }> {
  const completed = await prisma.event.updateMany({
    where: { status: { in: ['PUBLISHED', 'ONGOING'] }, endsAt: { lte: now } },
    data: { status: 'COMPLETED' },
  })
  const ongoing = await prisma.event.updateMany({
    where: { status: 'PUBLISHED', startsAt: { lte: now }, endsAt: { gt: now } },
    data: { status: 'ONGOING' },
  })
  return { ongoing: ongoing.count, completed: completed.count }
}

/** Deletes expired sessions and one-time tokens, and finished jobs older than 30 days. */
export async function cleanup(now: Date = new Date()): Promise<void> {
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000)
  await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: monthAgo } }] },
  })
  await prisma.authToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: monthAgo } }] },
  })
  await prisma.job.deleteMany({
    where: { status: { in: ['COMPLETED', 'FAILED'] }, createdAt: { lt: monthAgo } },
  })
}

export async function runMaintenance(now: Date = new Date()): Promise<void> {
  await syncEventStatuses(now)
  await applyRetention(now)
  await cleanup(now)
}
