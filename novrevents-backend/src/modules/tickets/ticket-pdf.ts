import { formatEventRange } from '../../lib/datetime.js'
import { prisma } from '../../lib/db.js'
import { accentOf, createPdf, downloadName } from '../../lib/pdf.js'
import { registerEmailAttachment } from '../communications/outbox.js'
import { eventLocationText } from '../events/event.dto.js'
import { ticketQrImage } from './ticket-credential.js'

const PAGE = { width: 419.53, height: 595.28 } // A5 portrait, in points
const MARGIN = 36

/** Renders the downloadable ticket: event details, attendee, and the QR credential. */
export async function renderTicketPdf(
  ticketId: string,
): Promise<{ filename: string; content: Buffer } | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { registration: true, ticketType: true, event: true },
  })
  if (!ticket) return null
  const { event, registration } = ticket
  const accent = accentOf(event.accentColor)
  const contentWidth = PAGE.width - MARGIN * 2
  const qr = (await ticketQrImage(ticket.code, 'png')) as Buffer

  const { doc, finished } = createPdf({
    size: 'A5',
    margin: MARGIN,
    title: `Ticket — ${event.title}`,
  })

  // Header band
  doc.rect(0, 0, PAGE.width, 64).fill(accent)
  doc
    .fillColor('#ffffff')
    .font('sans-bold')
    .fontSize(11)
    .text('NOVR EVENTS', MARGIN, 26, { characterSpacing: 1.5 })
  doc
    .font('sans')
    .fontSize(11)
    .text('TICKET', MARGIN, 26, { width: contentWidth, align: 'right', characterSpacing: 1.5 })

  // Event
  doc
    .fillColor('#102a43')
    .font('sans-bold')
    .fontSize(18)
    .text(event.title, MARGIN, 88, { width: contentWidth })
  doc.moveDown(0.5)
  doc.fillColor('#334e68').font('sans').fontSize(10)
  doc.text(formatEventRange(event.startsAt, event.endsAt, event.timezone), { width: contentWidth })
  doc.moveDown(0.2)
  doc.text(eventLocationText(event), { width: contentWidth })
  doc.moveDown(0.2)
  doc.text(`Organised by ${event.organizerName}`, { width: contentWidth })

  // Attendee
  const dividerY = doc.y + 14
  doc
    .moveTo(MARGIN, dividerY)
    .lineTo(PAGE.width - MARGIN, dividerY)
    .lineWidth(1)
    .strokeColor('#d9e2ec')
    .stroke()
  doc
    .fillColor('#627d98')
    .font('sans')
    .fontSize(8)
    .text('ATTENDEE', MARGIN, dividerY + 14, { characterSpacing: 1 })
  doc
    .fillColor('#102a43')
    .font('sans-bold')
    .fontSize(14)
    .text(registration.attendeeName, MARGIN, dividerY + 27, {
      width: contentWidth,
    })
  doc
    .fillColor('#334e68')
    .font('sans')
    .fontSize(10)
    .text(ticket.ticketType.name, { width: contentWidth })

  // QR credential
  const qrSize = 190
  const qrY = Math.max(doc.y + 18, 300)
  doc.image(qr, (PAGE.width - qrSize) / 2, qrY, { width: qrSize, height: qrSize })
  doc
    .fillColor('#102a43')
    .font('mono')
    .fontSize(13)
    .text(ticket.code, MARGIN, qrY + qrSize + 8, {
      width: contentWidth,
      align: 'center',
      characterSpacing: 1,
    })

  const voided = ticket.status === 'VOID'
  doc
    .fillColor(voided ? '#b42318' : '#627d98')
    .font('sans')
    .fontSize(8)
    .text(
      voided
        ? 'This ticket is no longer valid.'
        : 'Show this QR code at check-in. It admits one person and can be used once. Do not share it.',
      MARGIN,
      PAGE.height - MARGIN - 22,
      { width: contentWidth, align: 'center' },
    )

  doc.end()
  return { filename: downloadName(`Ticket ${event.title}`, 'pdf'), content: await finished }
}

// Ticket emails attach the PDF through the outbox; registering here keeps the outbox generic.
registerEmailAttachment('ticket', renderTicketPdf)
