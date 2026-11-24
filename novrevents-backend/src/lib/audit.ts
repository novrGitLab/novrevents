import type { FastifyRequest } from 'fastify'
import { Prisma, prisma, type Db } from './db.js'

export interface AuditEntry {
  /** Dotted verb, e.g. `event.publish`, `submission.delete`, `admin.user.suspend`. */
  action: string
  targetType?: string
  targetId?: string
  eventId?: string | null
  organizationId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Records a sensitive operation. Pass the transaction client when the write must be atomic with
 * the change it describes. `request` supplies the actor, IP and request id; omit it for system jobs.
 */
export async function audit(
  request: FastifyRequest | null,
  entry: AuditEntry,
  db: Db = prisma,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: request?.auth?.userId ?? null,
      actorRole: request?.auth ? request.auth.role : request ? 'ANONYMOUS' : 'SYSTEM',
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      eventId: entry.eventId ?? null,
      organizationId: entry.organizationId ?? null,
      metadata: (entry.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      ipAddress: request?.ip ?? null,
      requestId: request?.id ?? null,
    },
  })
}
