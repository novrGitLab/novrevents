import { prisma, type Db } from '../../lib/db.js'
import type { NotificationType } from '../../generated/prisma/client.js'

export interface NotificationInput {
  userId: string
  type: NotificationType
  title: string
  body?: string | null
  /** Frontend path to open when the notification is clicked. */
  linkPath?: string | null
}

export async function notify(db: Db, input: NotificationInput): Promise<void> {
  await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 500) ?? null,
      linkPath: input.linkPath ?? null,
    },
  })
}

export async function notifyMany(
  db: Db,
  userIds: string[],
  input: Omit<NotificationInput, 'userId'>,
): Promise<void> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return
  await db.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 500) ?? null,
      linkPath: input.linkPath ?? null,
    })),
  })
}

/**
 * Tells every follower of `authorId` about something the author published.
 * A single INSERT … SELECT, so it stays cheap for accounts with many followers.
 */
export async function notifyFollowers(
  db: Db,
  authorId: string,
  input: { type: NotificationType; title: string; body?: string | null; linkPath?: string | null },
): Promise<number> {
  return db.$executeRaw`
    INSERT INTO notifications (id, user_id, type, title, body, link_path)
    SELECT gen_random_uuid(), f.follower_id, ${input.type}::"NotificationType",
           ${input.title.slice(0, 200)}, ${input.body?.slice(0, 500) ?? null}, ${input.linkPath ?? null}
      FROM follows f
      JOIN users u ON u.id = f.follower_id AND u.status = 'ACTIVE'
     WHERE f.following_id = ${authorId}::uuid`
}

export async function listNotifications(
  userId: string,
  page: number,
  pageSize: number,
  unreadOnly: boolean,
) {
  const where = { userId, ...(unreadOnly ? { readAt: null } : {}) }
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ])
  return { items, total, unreadCount }
}

export async function markRead(userId: string, id: string): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  })
  return result.count > 0
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  })
  return result.count
}
