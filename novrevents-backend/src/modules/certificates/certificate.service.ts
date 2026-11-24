import { appUrl } from '../../config/env.js'
import { randomCode } from '../../lib/crypto.js'
import { formatEventDates } from '../../lib/datetime.js'
import { isUniqueViolation, prisma } from '../../lib/db.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { accentOf, createPdf, downloadName } from '../../lib/pdf.js'
import type { Certificate } from '../../generated/prisma/client.js'
import { queueEmail } from '../communications/outbox.js'
import { certificateIssuedContent } from '../communications/templates.js'
import { requireEventAccess } from '../events/event-access.js'
import { eventEmailInfo } from '../events/event.dto.js'

export const DEFAULT_TEMPLATE_BODY =
  'This certifies that {{participant_name}} attended {{event_name}} on {{event_date}}.'

export const certificateUrls = (code: string) => ({
  verifyUrl: `${appUrl}/certificates/${code}`,
  downloadUrl: `${appUrl}/api/v1/public/certificates/${code}/pdf`,
})

function fillTemplate(
  body: string,
  values: { participant: string; event: string; date: string },
): string {
  return body
    .replace(/\{\{\s*participant_name\s*\}\}/g, values.participant)
    .replace(/\{\{\s*event_name\s*\}\}/g, values.event)
    .replace(/\{\{\s*event_date\s*\}\}/g, values.date)
}

// ─── Template ────────────────────────────────────────────────────────────────

export async function getTemplate(userId: string, eventId: string) {
  const { event } = await requireEventAccess(userId, eventId, 'manage')
  const template = await prisma.certificateTemplate.findUnique({ where: { eventId } })
  return {
    title: template?.title ?? 'Certificate of Attendance',
    body: template?.body ?? DEFAULT_TEMPLATE_BODY,
    issuerName: template?.issuerName ?? event.organizerName,
    signatoryName: template?.signatoryName ?? null,
    signatoryTitle: template?.signatoryTitle ?? null,
    isSaved: template !== null,
  }
}

export async function saveTemplate(
  userId: string,
  eventId: string,
  input: {
    title: string
    body: string
    issuerName: string | null
    signatoryName: string | null
    signatoryTitle: string | null
  },
) {
  await requireEventAccess(userId, eventId, 'manage')
  if (!/\{\{\s*participant_name\s*\}\}/.test(input.body)) {
    throw badRequest(
      'The certificate text must include {{participant_name}}.',
      'TEMPLATE_MISSING_NAME',
    )
  }
  await prisma.certificateTemplate.upsert({
    where: { eventId },
    create: { eventId, ...input },
    update: input,
  })
  return getTemplate(userId, eventId)
}

/** Renders a preview with sample values; nothing is stored. */
export async function previewPdf(userId: string, eventId: string) {
  const { event } = await requireEventAccess(userId, eventId, 'manage')
  const template = await getTemplate(userId, eventId)
  const eventDateText = formatEventDates(event.startsAt, event.endsAt, event.timezone)
  return renderPdf({
    verificationCode: 'PREV-IEWX-XXXX',
    recipientName: 'Participant Name',
    title: template.title,
    body: fillTemplate(template.body, {
      participant: 'Participant Name',
      event: event.title,
      date: eventDateText,
    }),
    eventName: event.title,
    eventDateText,
    issuerName: template.issuerName,
    signatoryName: template.signatoryName,
    signatoryTitle: template.signatoryTitle,
    accentColor: event.accentColor,
    issuedAt: new Date(),
    revokedAt: null,
  })
}

// ─── Issuance ────────────────────────────────────────────────────────────────

export interface IssueInput {
  /** `attended` issues to every checked-in attendee who does not have one yet. */
  mode: 'attended' | 'selected'
  registrationIds: string[]
  sendEmail: boolean
}

/**
 * Issues certificates. Each one is a snapshot of the template at issuance, so editing the template
 * later never changes a certificate that has already been given out. Attendees must have checked in
 * unless the organiser explicitly selects them (organiser authorisation).
 */
export async function issueCertificates(userId: string, eventId: string, input: IssueInput) {
  const { event } = await requireEventAccess(userId, eventId, 'manage')
  if (event.status === 'DRAFT')
    throw conflict('Publish the event before issuing certificates.', 'EVENT_NOT_LIVE')
  const template = await getTemplate(userId, eventId)

  const registrations = await prisma.registration.findMany({
    where: {
      eventId,
      status: 'CONFIRMED',
      certificate: null,
      ...(input.mode === 'attended'
        ? { ticket: { checkIn: { isNot: null } } }
        : { id: { in: input.registrationIds } }),
    },
  })
  if (input.mode === 'selected' && input.registrationIds.length === 0) {
    throw badRequest('Choose at least one attendee.', 'NO_RECIPIENTS')
  }

  const eventDateText = formatEventDates(event.startsAt, event.endsAt, event.timezone)
  let issued = 0
  for (const registration of registrations) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(async (tx) => {
          const certificate = await tx.certificate.create({
            data: {
              eventId,
              registrationId: registration.id,
              verificationCode: randomCode(3, 4),
              recipientName: registration.attendeeName,
              recipientEmail: registration.attendeeEmail,
              title: template.title,
              body: fillTemplate(template.body, {
                participant: registration.attendeeName,
                event: event.title,
                date: eventDateText,
              }),
              eventName: event.title,
              eventDateText,
              issuerName: template.issuerName,
              signatoryName: template.signatoryName,
              signatoryTitle: template.signatoryTitle,
              accentColor: event.accentColor,
              issuedById: userId,
            },
          })
          if (input.sendEmail) {
            const urls = certificateUrls(certificate.verificationCode)
            await queueEmail(tx, {
              type: 'CERTIFICATE_ISSUED',
              to: { email: registration.attendeeEmail, name: registration.attendeeName },
              userId: registration.userId,
              eventId,
              registrationId: registration.id,
              content: () =>
                certificateIssuedContent({
                  event: eventEmailInfo(event),
                  recipientName: registration.attendeeName,
                  code: certificate.verificationCode,
                  ...urls,
                }),
            })
          }
          if (registration.userId) {
            await tx.notification.create({
              data: {
                userId: registration.userId,
                type: 'CERTIFICATE_ISSUED',
                title: `Your certificate for ${event.title} is ready`,
                linkPath: `/certificates/${certificate.verificationCode}`,
              },
            })
          }
        })
        issued += 1
        break
      } catch (error) {
        // Another request issued this attendee's certificate first: nothing to do.
        if (isUniqueViolation(error, 'registration_id')) break
        if (!isUniqueViolation(error, 'verification_code')) throw error
      }
    }
  }
  return { issued, skipped: input.mode === 'selected' ? input.registrationIds.length - issued : 0 }
}

export async function listCertificates(userId: string, eventId: string) {
  await requireEventAccess(userId, eventId, 'manage')
  const [certificates, eligible] = await Promise.all([
    prisma.certificate.findMany({ where: { eventId }, orderBy: { issuedAt: 'desc' } }),
    prisma.registration.count({
      where: {
        eventId,
        status: 'CONFIRMED',
        certificate: null,
        ticket: { checkIn: { isNot: null } },
      },
    }),
  ])
  return {
    items: certificates.map((certificate) => ({
      id: certificate.id,
      registrationId: certificate.registrationId,
      verificationCode: certificate.verificationCode,
      recipientName: certificate.recipientName,
      recipientEmail: certificate.recipientEmail,
      issuedAt: certificate.issuedAt,
      revokedAt: certificate.revokedAt,
      revokedReason: certificate.revokedReason,
      ...certificateUrls(certificate.verificationCode),
    })),
    eligibleAttendees: eligible,
  }
}

export async function revokeCertificate(
  userId: string,
  eventId: string,
  certificateId: string,
  reason: string | null,
) {
  await requireEventAccess(userId, eventId, 'manage')
  const certificate = await prisma.certificate.findFirst({ where: { id: certificateId, eventId } })
  if (!certificate) throw notFound('Certificate')
  if (certificate.revokedAt)
    throw conflict('This certificate is already revoked.', 'ALREADY_REVOKED')
  await prisma.certificate.update({
    where: { id: certificateId },
    data: { revokedAt: new Date(), revokedReason: reason },
  })
}

// ─── Public verification ─────────────────────────────────────────────────────

async function findByCode(code: string) {
  const normalised = code.toUpperCase().trim()
  const certificate = await prisma.certificate.findUnique({
    where: { verificationCode: normalised },
    include: { event: { select: { slug: true, organizerName: true } } },
  })
  if (!certificate) throw notFound('Certificate')
  return certificate
}

/** What the public verification page shows. The recipient's email is never disclosed. */
export async function verifyCertificate(code: string) {
  const certificate = await findByCode(code)
  return {
    verificationCode: certificate.verificationCode,
    valid: certificate.revokedAt === null,
    recipientName: certificate.recipientName,
    title: certificate.title,
    eventName: certificate.eventName,
    eventDateText: certificate.eventDateText,
    eventSlug: certificate.event.slug,
    issuerName: certificate.issuerName,
    issuedAt: certificate.issuedAt,
    revokedAt: certificate.revokedAt,
  }
}

export async function certificatePdf(code: string) {
  const certificate = await findByCode(code)
  if (certificate.revokedAt)
    throw conflict('This certificate has been revoked.', 'CERTIFICATE_REVOKED')
  return renderPdf(certificate)
}

// ─── Rendering ───────────────────────────────────────────────────────────────

type Renderable = Pick<
  Certificate,
  | 'verificationCode'
  | 'recipientName'
  | 'title'
  | 'body'
  | 'eventName'
  | 'eventDateText'
  | 'issuerName'
  | 'signatoryName'
  | 'signatoryTitle'
  | 'accentColor'
  | 'issuedAt'
  | 'revokedAt'
>

async function renderPdf(certificate: Renderable): Promise<{ filename: string; content: Buffer }> {
  const { doc, finished } = createPdf({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    title: certificate.title,
  })
  const width = doc.page.width
  const height = doc.page.height
  const accent = accentOf(certificate.accentColor)
  const inner = { x: 56, width: width - 112 }

  doc.rect(0, 0, width, height).fill('#ffffff')
  doc
    .rect(24, 24, width - 48, height - 48)
    .lineWidth(2)
    .strokeColor(accent)
    .stroke()
  doc
    .rect(32, 32, width - 64, height - 64)
    .lineWidth(0.5)
    .strokeColor('#bcccdc')
    .stroke()

  doc
    .fillColor(accent)
    .font('sans-bold')
    .fontSize(10)
    .text('NOVR EVENTS', inner.x, 64, { width: inner.width, align: 'center', characterSpacing: 2 })
  doc
    .fillColor('#102a43')
    .font('serif-bold')
    .fontSize(32)
    .text(certificate.title, inner.x, 104, { width: inner.width, align: 'center' })
  doc
    .fillColor('#486581')
    .font('serif-italic')
    .fontSize(13)
    .text('This is presented to', inner.x, 168, { width: inner.width, align: 'center' })
  doc
    .fillColor('#102a43')
    .font('serif-bold')
    .fontSize(30)
    .text(certificate.recipientName, inner.x, 196, { width: inner.width, align: 'center' })
  doc
    .moveTo(width / 2 - 160, 242)
    .lineTo(width / 2 + 160, 242)
    .lineWidth(1)
    .strokeColor(accent)
    .stroke()
  doc
    .fillColor('#334e68')
    .font('serif')
    .fontSize(13)
    .text(certificate.body, inner.x + 60, 264, {
      width: inner.width - 120,
      align: 'center',
      lineGap: 4,
    })

  const footerY = height - 150
  doc
    .fillColor('#102a43')
    .font('sans-bold')
    .fontSize(11)
    .text(certificate.issuerName, inner.x + 40, footerY, { width: 260 })
  doc
    .fillColor('#627d98')
    .font('sans')
    .fontSize(9)
    .text(certificate.eventDateText, inner.x + 40, footerY + 16, { width: 260 })
  if (certificate.signatoryName) {
    doc
      .moveTo(width - inner.x - 300, footerY - 8)
      .lineTo(width - inner.x - 40, footerY - 8)
      .lineWidth(0.75)
      .strokeColor('#9fb3c8')
      .stroke()
    doc
      .fillColor('#102a43')
      .font('sans-bold')
      .fontSize(11)
      .text(certificate.signatoryName, width - inner.x - 300, footerY, {
        width: 260,
        align: 'right',
      })
    if (certificate.signatoryTitle) {
      doc
        .fillColor('#627d98')
        .font('sans')
        .fontSize(9)
        .text(certificate.signatoryTitle, width - inner.x - 300, footerY + 16, {
          width: 260,
          align: 'right',
        })
    }
  }

  const verifyUrl = `${appUrl}/certificates/${certificate.verificationCode}`
  doc
    .fillColor('#627d98')
    .font('sans')
    .fontSize(8)
    .text(
      `Verification ID ${certificate.verificationCode} · Verify at ${verifyUrl}`,
      inner.x,
      height - 72,
      { width: inner.width, align: 'center' },
    )

  doc.end()
  return {
    filename: downloadName(
      `Certificate ${certificate.eventName} ${certificate.recipientName}`,
      'pdf',
    ),
    content: await finished,
  }
}
