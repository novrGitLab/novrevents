import { type Prisma, prisma, type Db } from '../lib/db.js'

/**
 * Database-backed job queue. Jobs are rows in `jobs`; workers claim due rows with
 * `FOR UPDATE SKIP LOCKED`, so any number of API processes can run the worker safely and a job is
 * processed by exactly one of them. Failed jobs are retried with exponential backoff.
 */

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>

const handlers = new Map<string, JobHandler>()

export function defineJob(type: string, handler: JobHandler): void {
  handlers.set(type, handler)
}

export interface EnqueueOptions {
  runAt?: Date
  /** A second enqueue with the same key is ignored while the first job exists. */
  dedupeKey?: string
  maxAttempts?: number
}

export async function enqueueJob(
  db: Db,
  type: string,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {},
): Promise<void> {
  await db.job.createMany({
    data: [
      {
        type,
        payload: payload as Prisma.InputJsonValue,
        runAt: options.runAt ?? new Date(),
        dedupeKey: options.dedupeKey ?? null,
        maxAttempts: options.maxAttempts ?? 5,
      },
    ],
    skipDuplicates: true,
  })
}

/** Removes a pending job so it never runs (e.g. a reminder for an event that was cancelled). */
export async function cancelJob(db: Db, dedupeKey: string): Promise<void> {
  await db.job.deleteMany({ where: { dedupeKey, status: 'PENDING' } })
}

const STUCK_AFTER_MS = 15 * 60 * 1000

/** Runs due jobs. Returns how many were processed. */
export async function runDueJobs(
  options: {
    limit?: number
    now?: Date
    logger?: { warn: (obj: object, msg: string) => void }
  } = {},
): Promise<number> {
  const now = options.now ?? new Date()
  await prisma.job.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
    data: { status: 'PENDING', lockedAt: null },
  })

  const claimed = await prisma.$queryRaw<
    Array<{
      id: string
      type: string
      payload: Record<string, unknown>
      attempts: number
      max_attempts: number
    }>
  >`
    UPDATE jobs
       SET status = 'RUNNING', locked_at = now(), attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM jobs
        WHERE status = 'PENDING' AND run_at <= ${now}
        ORDER BY run_at
        LIMIT ${options.limit ?? 20}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, type, payload, attempts, max_attempts`

  for (const job of claimed) {
    const handler = handlers.get(job.type)
    try {
      if (!handler) throw new Error(`No handler registered for job type "${job.type}"`)
      await handler(job.payload)
      // Completed jobs release their dedupe key so the same work can be scheduled again later.
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', completedAt: new Date(), lockedAt: null, dedupeKey: null },
      })
    } catch (error) {
      const exhausted = job.attempts >= job.max_attempts
      const delayMs = Math.min(60 * 60_000, 30_000 * 2 ** (job.attempts - 1))
      await prisma.job.update({
        where: { id: job.id },
        data: exhausted
          ? {
              status: 'FAILED',
              lastError: String((error as Error).message).slice(0, 1000),
              lockedAt: null,
              dedupeKey: null,
            }
          : {
              status: 'PENDING',
              lastError: String((error as Error).message).slice(0, 1000),
              lockedAt: null,
              runAt: new Date(Date.now() + delayMs),
            },
      })
      options.logger?.warn({ jobId: job.id, type: job.type, err: error }, 'job failed')
    }
  }
  return claimed.length
}
