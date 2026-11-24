import { prisma } from '../../lib/db.js'
import { AppError, badRequest, notFound, type ErrorDetail } from '../../lib/errors.js'
import { deleteStoredFiles, publicFileUrl } from '../../lib/storage/index.js'
import { storeImage } from '../../lib/uploads.js'
import type { Event, EventSpeaker } from '../../generated/prisma/client.js'
import { requireEventAccess } from '../events/event-access.js'

const toSpeaker = (speaker: EventSpeaker) => ({
  ...speaker,
  photoUrl: publicFileUrl(speaker.photoKey),
})

// ─── Speakers ────────────────────────────────────────────────────────────────

export interface SpeakerInput {
  name?: string
  title?: string | null
  organization?: string | null
  bio?: string | null
  sortOrder?: number
}

export async function listSpeakers(userId: string, eventId: string) {
  await requireEventAccess(userId, eventId, 'checkin')
  const speakers = await prisma.eventSpeaker.findMany({
    where: { eventId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return speakers.map(toSpeaker)
}

export async function createSpeaker(
  userId: string,
  eventId: string,
  input: SpeakerInput & { name: string },
) {
  await requireEventAccess(userId, eventId, 'manage')
  const last = await prisma.eventSpeaker.aggregate({
    where: { eventId },
    _max: { sortOrder: true },
  })
  const speaker = await prisma.eventSpeaker.create({
    data: {
      eventId,
      name: input.name,
      title: input.title ?? null,
      organization: input.organization ?? null,
      bio: input.bio ?? null,
      sortOrder: input.sortOrder ?? (last._max.sortOrder ?? -1) + 1,
    },
  })
  return toSpeaker(speaker)
}

async function findSpeaker(eventId: string, speakerId: string): Promise<EventSpeaker> {
  const speaker = await prisma.eventSpeaker.findFirst({ where: { id: speakerId, eventId } })
  if (!speaker) throw notFound('Speaker')
  return speaker
}

export async function updateSpeaker(
  userId: string,
  eventId: string,
  speakerId: string,
  patch: SpeakerInput,
) {
  await requireEventAccess(userId, eventId, 'manage')
  await findSpeaker(eventId, speakerId)
  return toSpeaker(await prisma.eventSpeaker.update({ where: { id: speakerId }, data: patch }))
}

export async function setSpeakerPhoto(
  userId: string,
  eventId: string,
  speakerId: string,
  image: Buffer,
) {
  await requireEventAccess(userId, eventId, 'manage')
  const speaker = await findSpeaker(eventId, speakerId)
  const key = await storeImage('speakers', image)
  const updated = await prisma.eventSpeaker.update({
    where: { id: speakerId },
    data: { photoKey: key },
  })
  await deleteStoredFiles([speaker.photoKey])
  return toSpeaker(updated)
}

export async function deleteSpeaker(
  userId: string,
  eventId: string,
  speakerId: string,
): Promise<void> {
  await requireEventAccess(userId, eventId, 'manage')
  const speaker = await findSpeaker(eventId, speakerId)
  await prisma.eventSpeaker.delete({ where: { id: speakerId } })
  await deleteStoredFiles([speaker.photoKey])
}

// ─── Agenda sessions ─────────────────────────────────────────────────────────

export interface SessionInput {
  title?: string
  description?: string | null
  startsAt?: Date
  endsAt?: Date
  location?: string | null
  track?: string | null
  speakerIds?: string[]
}

const sessionInclude = { speakers: { select: { speakerId: true } } } as const

function toSession<T extends { speakers: Array<{ speakerId: string }> }>(session: T) {
  return { ...session, speakerIds: session.speakers.map((link) => link.speakerId) }
}

function assertSessionWindow(event: Event, startsAt: Date, endsAt: Date): void {
  const details: ErrorDetail[] = []
  if (endsAt <= startsAt)
    details.push({ path: 'body.endsAt', message: 'The session must end after it starts.' })
  if (startsAt < event.startsAt || endsAt > event.endsAt) {
    details.push({
      path: 'body.startsAt',
      message: 'Sessions must take place within the event’s start and end times.',
    })
  }
  if (details.length > 0)
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details)
}

async function assertSpeakersBelong(eventId: string, speakerIds: string[]): Promise<void> {
  if (speakerIds.length === 0) return
  const found = await prisma.eventSpeaker.count({ where: { eventId, id: { in: speakerIds } } })
  if (found !== new Set(speakerIds).size)
    throw badRequest('One or more speakers do not belong to this event.', 'INVALID_SPEAKER')
}

export async function listSessions(userId: string, eventId: string) {
  await requireEventAccess(userId, eventId, 'checkin')
  const sessions = await prisma.eventSession.findMany({
    where: { eventId },
    orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
    include: sessionInclude,
  })
  return sessions.map(toSession)
}

export async function createSession(
  userId: string,
  eventId: string,
  input: SessionInput & { title: string; startsAt: Date; endsAt: Date },
) {
  const { event } = await requireEventAccess(userId, eventId, 'manage')
  assertSessionWindow(event, input.startsAt, input.endsAt)
  const speakerIds = [...new Set(input.speakerIds ?? [])]
  await assertSpeakersBelong(eventId, speakerIds)
  const session = await prisma.eventSession.create({
    data: {
      eventId,
      title: input.title,
      description: input.description ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location ?? null,
      track: input.track ?? null,
      speakers: { create: speakerIds.map((speakerId) => ({ speakerId })) },
    },
    include: sessionInclude,
  })
  return toSession(session)
}

export async function updateSession(
  userId: string,
  eventId: string,
  sessionId: string,
  patch: SessionInput,
) {
  const { event } = await requireEventAccess(userId, eventId, 'manage')
  const existing = await prisma.eventSession.findFirst({ where: { id: sessionId, eventId } })
  if (!existing) throw notFound('Session')
  assertSessionWindow(event, patch.startsAt ?? existing.startsAt, patch.endsAt ?? existing.endsAt)

  const { speakerIds, ...fields } = patch
  const uniqueSpeakerIds = speakerIds ? [...new Set(speakerIds)] : undefined
  if (uniqueSpeakerIds) await assertSpeakersBelong(eventId, uniqueSpeakerIds)

  const session = await prisma.$transaction(async (tx) => {
    if (uniqueSpeakerIds) {
      await tx.sessionSpeaker.deleteMany({ where: { sessionId } })
      await tx.sessionSpeaker.createMany({
        data: uniqueSpeakerIds.map((speakerId) => ({ sessionId, speakerId })),
      })
    }
    return tx.eventSession.update({
      where: { id: sessionId },
      data: fields,
      include: sessionInclude,
    })
  })
  return toSession(session)
}

export async function deleteSession(
  userId: string,
  eventId: string,
  sessionId: string,
): Promise<void> {
  await requireEventAccess(userId, eventId, 'manage')
  const result = await prisma.eventSession.deleteMany({ where: { id: sessionId, eventId } })
  if (result.count === 0) throw notFound('Session')
}
