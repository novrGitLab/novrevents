import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runDueJobs } from '../jobs/queue.js'
import { syncEventStatuses } from '../jobs/maintenance.js'
import { prisma } from '../lib/db.js'
import { clearSettingsCache } from '../modules/admin/settings.service.js'
import {
  configureOutbox,
  flushOutbox,
  unsubscribeTokenFor,
} from '../modules/communications/outbox.js'
import { EmailSendError, type EmailProvider, type OutgoingEmail } from '../lib/email/provider.js'
import { ticketQrPayload } from '../modules/tickets/ticket-credential.js'
import {
  createEventWithRegistration,
  createPublishedForm,
  createTestApp,
  CONSENT,
  createUser,
  errorCode,
  submit,
  TestClient,
  type TestUser,
} from './helpers.js'

let app: FastifyInstance
let organiser: TestUser

beforeAll(async () => {
  app = await createTestApp()
  organiser = await createUser(app)
  await prisma.systemSetting.upsert({
    where: { key: 'maxEventsPublishedPerDay' },
    create: { key: 'maxEventsPublishedPerDay', value: 500 },
    update: { value: 500 },
  })
  clearSettingsCache()
})

afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'maxEventsPublishedPerDay' } })
  clearSettingsCache()
  await app.close()
})

const person = (tag: string) => ({
  full_name: `Person ${tag}`,
  email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`,
})

async function registeredTicket(eventSlugForm: string) {
  const details = person('ticket')
  await submit(app, eventSlugForm, details)
  const registration = await prisma.registration.findFirstOrThrow({
    where: { attendeeEmail: details.email },
    include: { ticket: true },
  })
  return { registration, ticket: registration.ticket!, details }
}

interface Outcome {
  result: string
  attendee: { name: string } | null
  checkedInAt: string | null
  previousMethod: string | null
}

describe('QR check-in', () => {
  it('admits a valid ticket once and reports duplicates with the original time', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const { ticket, details } = await registeredTicket(form.slug)
    const payload = ticketQrPayload(ticket.code)

    const first = await organiser.client.post<Outcome>(`/api/v1/events/${event.id}/check-in/scan`, {
      payload,
    })
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ result: 'ACCEPTED', attendee: { name: details.full_name } })

    const second = await organiser.client.post<Outcome>(
      `/api/v1/events/${event.id}/check-in/scan`,
      { payload },
    )
    expect(second.body).toMatchObject({ result: 'DUPLICATE', previousMethod: 'QR' })
    expect(second.body.checkedInAt).toBe(first.body.checkedInAt)

    expect(await prisma.checkIn.count({ where: { ticketId: ticket.id } })).toBe(1)
    const logs = await prisma.scanLog.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(logs.map((log) => log.result)).toEqual(['ACCEPTED', 'DUPLICATE'])
  })

  it('admits exactly once when several devices scan the same ticket at the same moment', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const { ticket } = await registeredTicket(form.slug)
    const payload = ticketQrPayload(ticket.code)
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        organiser.client.post<Outcome>(`/api/v1/events/${event.id}/check-in/scan`, { payload }),
      ),
    )
    const outcomes = results.map((response) => response.body.result)
    expect(outcomes.filter((result) => result === 'ACCEPTED')).toHaveLength(1)
    expect(outcomes.filter((result) => result === 'DUPLICATE')).toHaveLength(5)
  })

  it('rejects forged, foreign and voided tickets', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const other = await createEventWithRegistration(organiser)
    const { ticket } = await registeredTicket(form.slug)
    const foreign = await registeredTicket(other.form.slug)
    const scan = (payload: string) =>
      organiser.client.post<Outcome>(`/api/v1/events/${event.id}/check-in/scan`, { payload })

    expect((await scan('hello world')).body.result).toBe('INVALID')
    const original = ticketQrPayload(ticket.code)
    const changed = original.slice(0, -1) + (original.endsWith('x') ? 'y' : 'x')
    expect((await scan(changed)).body.result).toBe('INVALID')
    // A correctly signed code that does not exist (signature checked first, then the database).
    expect((await scan(ticketQrPayload('ZZZZ-ZZZZ-ZZZZ'))).body.result).toBe('INVALID')

    const wrongEvent = await scan(ticketQrPayload(foreign.ticket.code))
    expect(wrongEvent.body.result).toBe('WRONG_EVENT')
    // Details of attendees of other events are not disclosed.
    expect(wrongEvent.body.attendee).toBeNull()

    await organiser.client.post(
      `/api/v1/events/${event.id}/registrations/${ticket.registrationId}/cancel`,
      { reason: 'Test' },
    )
    expect((await scan(ticketQrPayload(ticket.code))).body.result).toBe('VOID')
  })

  it('supports lookup, manual check-in and undo, and computes attendance', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const a = await registeredTicket(form.slug)
    await registeredTicket(form.slug)
    await registeredTicket(form.slug)
    await registeredTicket(form.slug)

    const lookup = await organiser.client.get<{ items: Array<{ registrationId: string }> }>(
      `/api/v1/events/${event.id}/check-in/lookup`,
      {
        query: { q: a.details.email.slice(0, 12) },
      },
    )
    expect(lookup.body.items.map((item) => item.registrationId)).toContain(a.registration.id)

    const manual = await organiser.client.post<Outcome>(
      `/api/v1/events/${event.id}/check-in/manual`,
      { registrationId: a.registration.id },
    )
    expect(manual.body.result).toBe('ACCEPTED')
    const typed = await organiser.client.post<Outcome>(
      `/api/v1/events/${event.id}/check-in/manual`,
      {
        ticketCode: a.ticket.code.toLowerCase().replace(/-/g, ' '),
      },
    )
    expect(typed.body).toMatchObject({ result: 'DUPLICATE', previousMethod: 'MANUAL' })

    const summary = await organiser.client.get<{
      expected: number
      checkedIn: number
      attendanceRate: number
      noShows: number | null
    }>(`/api/v1/events/${event.id}/attendance`)
    expect(summary.body).toMatchObject({
      expected: 4,
      checkedIn: 1,
      attendanceRate: 0.25,
      noShows: null,
    })

    expect(
      (await organiser.client.delete(`/api/v1/events/${event.id}/check-in/${a.registration.id}`))
        .status,
    ).toBe(200)
    const after = await organiser.client.get<{ checkedIn: number }>(
      `/api/v1/events/${event.id}/attendance`,
    )
    expect(after.body.checkedIn).toBe(0)
  })

  it('lets check-in staff scan but not undo, and keeps outsiders out', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const staff = await createUser(app)
    const outsider = await createUser(app)
    await organiser.client.post(`/api/v1/events/${event.id}/team`, {
      username: staff.username,
      role: 'STAFF',
    })
    const { ticket, registration } = await registeredTicket(form.slug)

    const scan = await staff.client.post<Outcome>(`/api/v1/events/${event.id}/check-in/scan`, {
      payload: ticketQrPayload(ticket.code),
    })
    expect(scan.body.result).toBe('ACCEPTED')
    expect(
      (await staff.client.delete(`/api/v1/events/${event.id}/check-in/${registration.id}`)).status,
    ).toBe(403)
    expect(
      (
        await outsider.client.post(`/api/v1/events/${event.id}/check-in/scan`, {
          payload: ticketQrPayload(ticket.code),
        })
      ).status,
    ).toBe(404)
  })
})

describe('analytics calculations', () => {
  it('derives funnel, attendance and no-show figures from stored records', async () => {
    const { event, form } = await createEventWithRegistration(organiser, {
      definition: {
        steps: [{ key: 'main', title: 'Main' }],
        fields: [
          {
            key: 'full_name',
            type: 'SHORT_TEXT',
            label: 'Name',
            required: true,
            role: 'RESPONDENT_NAME',
            stepKey: 'main',
          },
          {
            key: 'email',
            type: 'EMAIL',
            label: 'Email',
            required: true,
            role: 'RESPONDENT_EMAIL',
            stepKey: 'main',
          },
          {
            key: 'kind',
            type: 'RADIO',
            label: 'Kind',
            required: true,
            stepKey: 'main',
            options: [
              { value: 'ok', label: 'OK' },
              { value: 'no', label: 'No' },
            ],
          },
        ],
        rules: [
          {
            key: 'ex',
            type: 'EXCLUDE',
            conditions: {
              combinator: 'AND',
              conditions: [{ fieldKey: 'kind', operator: 'equals', value: 'no' }],
            },
          },
        ],
      },
    })

    // 8 distinct visitors (each a separate client IP is not possible with inject; use distinct user agents).
    for (let index = 0; index < 8; index += 1) {
      await new TestClient(app).post(
        `/api/v1/public/events/${event.slug}/view`,
        {},
        { headers: { 'user-agent': `visitor-${index}` } },
      )
    }
    // 5 people start the form; 4 qualify and register, 1 is excluded.
    for (let index = 0; index < 5; index += 1) {
      await new TestClient(app).post(`/api/v1/public/forms/${form.slug}/events`, {
        type: 'start',
        sessionKey: crypto.randomUUID(),
      })
    }
    const tickets: string[] = []
    for (let index = 0; index < 4; index += 1) {
      const details = person(`an-${index}`)
      await submit(app, form.slug, { ...details, kind: 'ok' })
      const registration = await prisma.registration.findFirstOrThrow({
        where: { attendeeEmail: details.email },
        include: { ticket: true },
      })
      tickets.push(registration.ticket!.code)
    }
    await submit(app, form.slug, { ...person('an-excluded'), kind: 'no' })

    for (const code of tickets.slice(0, 3)) {
      await organiser.client.post(`/api/v1/events/${event.id}/check-in/scan`, {
        payload: ticketQrPayload(code),
      })
    }
    // Move the event into the past so no-shows are reported.
    await prisma.event.update({
      where: { id: event.id },
      data: {
        startsAt: new Date(Date.now() - 3 * 3_600_000),
        endsAt: new Date(Date.now() - 3_600_000),
      },
    })

    const response = await organiser.client.get<{
      traffic: { pageViews: number; uniqueVisitors: number }
      funnel: {
        registrationStarts: number
        registrationCompletions: number
        conversionRate: number
        formCompletionRate: number
      }
      responses: { received: number; qualifying: number; excluded: number }
      tickets: { issued: number }
      attendance: {
        expected: number
        checkedIn: number
        attendanceRate: number
        noShows: number
        noShowRate: number
      }
      definitions: Record<string, string>
      daily: Array<{ views: number; registrations: number }>
    }>(`/api/v1/events/${event.id}/analytics`)
    expect(response.status).toBe(200)
    const data = response.body
    expect(data.traffic).toMatchObject({ pageViews: 8, uniqueVisitors: 8 })
    // 5 beacon starts plus 5 submissions with their own session keys → 10 distinct starts.
    expect(data.funnel.registrationStarts).toBe(10)
    expect(data.funnel.registrationCompletions).toBe(4)
    expect(data.funnel.conversionRate).toBeCloseTo(4 / 8)
    expect(data.funnel.formCompletionRate).toBeCloseTo(4 / 10)
    expect(data.responses).toEqual({ received: 5, qualifying: 4, excluded: 1 })
    expect(data.tickets.issued).toBe(4)
    expect(data.attendance).toMatchObject({
      expected: 4,
      checkedIn: 3,
      attendanceRate: 0.75,
      noShows: 1,
      noShowRate: 0.25,
    })
    expect(data.daily.reduce((sum, day) => sum + day.registrations, 0)).toBe(4)
    expect(Object.keys(data.definitions)).toEqual(
      expect.arrayContaining(['conversionRate', 'noShowRate']),
    )
  })

  it('reports null rates instead of dividing by zero', async () => {
    const { event } = await createEventWithRegistration(organiser)
    const response = await organiser.client.get<{
      funnel: { conversionRate: number | null }
      attendance: { attendanceRate: number | null }
    }>(`/api/v1/events/${event.id}/analytics`)
    expect(response.body.funnel.conversionRate).toBeNull()
    expect(response.body.attendance.attendanceRate).toBeNull()
  })
})

describe('email scheduling and delivery', () => {
  it('schedules the automatic reminder 24 hours before the start and sends it through the job queue', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const details = person('remind')
    await submit(app, form.slug, details)

    const reminder = await prisma.messageCampaign.findFirstOrThrow({
      where: { eventId: event.id, isAutomatic: true },
    })
    const row = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
    expect(reminder.status).toBe('SCHEDULED')
    expect(reminder.scheduledAt?.getTime()).toBe(row.startsAt.getTime() - 24 * 3_600_000)
    const job = await prisma.job.findFirstOrThrow({
      where: { dedupeKey: `campaign:${reminder.id}` },
    })
    expect(job.runAt.getTime()).toBe(reminder.scheduledAt?.getTime())

    // Not due yet: nothing happens.
    await runDueJobs({ now: new Date() })
    expect(await prisma.message.count({ where: { campaignId: reminder.id } })).toBe(0)

    // At the scheduled time the job expands the campaign into one message per attendee. One pass claims at most
    // `limit` due jobs, oldest first. Jobs left by earlier tests in this file can be older than this reminder, so
    // the pass must be large enough to reach it. The production worker repeats passes, so nothing is lost there.
    await runDueJobs({ now: new Date(reminder.scheduledAt!.getTime() + 1000), limit: 500 })
    const messages = await prisma.message.findMany({ where: { campaignId: reminder.id } })
    expect(messages.map((message) => message.toEmail)).toEqual([details.email])
    expect(messages[0]?.type).toBe('EVENT_REMINDER')
    expect(
      (await prisma.messageCampaign.findUniqueOrThrow({ where: { id: reminder.id } })).status,
    ).toBe('SENT')
  })

  it('moves the reminder when the event is rescheduled and drops it when the event is cancelled', async () => {
    const { event } = await createEventWithRegistration(organiser)
    const before = await prisma.messageCampaign.findFirstOrThrow({
      where: { eventId: event.id, isAutomatic: true },
    })
    const row = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
    const newStart = new Date(row.startsAt.getTime() + 7 * 86_400_000)
    await organiser.client.patch(`/api/v1/events/${event.id}`, {
      startsAt: newStart.toISOString(),
      endsAt: new Date(newStart.getTime() + 8 * 3_600_000).toISOString(),
    })
    const after = await prisma.messageCampaign.findUniqueOrThrow({ where: { id: before.id } })
    expect(after.scheduledAt?.getTime()).toBe(newStart.getTime() - 24 * 3_600_000)
    expect(
      (
        await prisma.job.findFirstOrThrow({ where: { dedupeKey: `campaign:${before.id}` } })
      ).runAt.getTime(),
    ).toBe(after.scheduledAt?.getTime())

    await organiser.client.post(`/api/v1/events/${event.id}/cancel`, { notifyAttendees: true })
    expect(
      (await prisma.messageCampaign.findUniqueOrThrow({ where: { id: before.id } })).status,
    ).toBe('CANCELLED')
    expect(
      await prisma.job.count({ where: { dedupeKey: `campaign:${before.id}`, status: 'PENDING' } }),
    ).toBe(0)
  })

  it('sends announcements only to attendees and respects unsubscribes', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const stays = person('stays')
    const leaves = person('leaves')
    await submit(app, form.slug, stays)
    await submit(app, form.slug, leaves)

    // The attendee who leaves uses the signed link from an email, without an account.
    const token = unsubscribeTokenFor(leaves.email)
    const unsubscribe = await new TestClient(app).patch<{
      preferences: { announcements: boolean }
    }>('/api/v1/public/email-preferences', { announcements: false }, { query: { token } })
    expect(unsubscribe.body.preferences.announcements).toBe(false)
    expect(
      (
        await new TestClient(app).get('/api/v1/public/email-preferences', {
          query: { token: `${token}x` },
        })
      ).status,
    ).toBe(400)

    const custom = await organiser.client.post(`/api/v1/events/${event.id}/campaigns`, {
      type: 'ANNOUNCEMENT',
      subject: 'Venue update',
      body: 'Hall B',
      audience: 'CUSTOM',
      customRecipients: ['random@example.test'],
    })
    expect(errorCode(custom)).toBe('INVALID_AUDIENCE')

    const sent = await organiser.client.post<{
      recipientCount: number
      delivery: { suppressed: number; queued: number }
    }>(`/api/v1/events/${event.id}/campaigns`, {
      type: 'ANNOUNCEMENT',
      subject: 'Venue update',
      body: 'We moved to <b>Hall B</b>.',
    })
    expect(sent.status).toBe(201)
    expect(sent.body.recipientCount).toBe(2)
    expect(sent.body.delivery).toMatchObject({ suppressed: 1, queued: 1 })

    const message = await prisma.message.findFirstOrThrow({
      where: { toEmail: stays.email, type: 'ANNOUNCEMENT' },
    })
    // Organiser text is escaped, and optional mail carries an unsubscribe link.
    expect(message.bodyHtml).toContain('&lt;b&gt;Hall B&lt;/b&gt;')
    expect(message.bodyHtml).not.toContain('<b>Hall B</b>')
    expect(message.bodyText).toContain('/unsubscribe?token=')
  })

  it('sends speaker invitations that link to a published speaker form', async () => {
    const { event } = await createEventWithRegistration(organiser)
    const speakerForm = await createPublishedForm(organiser, {
      purpose: 'SPEAKER',
      eventId: event.id,
      title: 'Call for speakers',
    })
    const generalForm = await createPublishedForm(organiser, {
      purpose: 'GENERAL',
      eventId: event.id,
    })

    const wrongForm = await organiser.client.post(`/api/v1/events/${event.id}/campaigns`, {
      type: 'SPEAKER_INVITATION',
      subject: 'Speak at our event',
      body: 'Join us',
      audience: 'CUSTOM',
      customRecipients: ['speaker@example.test'],
      formId: generalForm.id,
    })
    expect(errorCode(wrongForm)).toBe('INVALID_FORM')

    const invite = await organiser.client.post<{ recipientCount: number }>(
      `/api/v1/events/${event.id}/campaigns`,
      {
        type: 'SPEAKER_INVITATION',
        subject: 'Speak at our event',
        body: 'We would love to hear from you.',
        audience: 'CUSTOM',
        customRecipients: ['speaker@example.test', 'SPEAKER@example.test'],
        formId: speakerForm.id,
      },
    )
    expect(invite.body.recipientCount).toBe(1)
    const message = await prisma.message.findFirstOrThrow({
      where: { eventId: event.id, type: 'SPEAKER_INVITATION' },
    })
    expect(message.bodyText).toContain(`/f/${speakerForm.slug}`)
  })

  it('retries transient provider failures and records permanent ones', async () => {
    const attempts: OutgoingEmail[] = []
    let mode: 'transient' | 'permanent' | 'ok' = 'transient'
    const provider: EmailProvider = {
      name: 'test',
      async send(email) {
        attempts.push(email)
        if (mode === 'transient') throw new EmailSendError('503 from provider', true)
        if (mode === 'permanent') throw new EmailSendError('400 invalid address', false)
        return { providerMessageId: 'msg-123' }
      },
    }
    configureOutbox({ provider })
    try {
      await prisma.message.updateMany({
        where: { status: 'QUEUED' },
        data: { status: 'CANCELLED' },
      })
      const user = await createUser(app, { verified: false })
      const message = await prisma.message.findFirstOrThrow({
        where: { toEmail: user.email, type: 'EMAIL_VERIFICATION' },
      })

      await flushOutbox({ now: new Date() })
      let stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } })
      expect(stored).toMatchObject({
        status: 'QUEUED',
        attempts: 1,
        errorMessage: '503 from provider',
      })
      expect(stored.scheduledFor.getTime()).toBeGreaterThan(Date.now())

      mode = 'ok'
      await flushOutbox({ now: new Date(Date.now() + 60 * 60_000) })
      stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } })
      expect(stored).toMatchObject({
        status: 'SENT',
        providerMessageId: 'msg-123',
        provider: 'test',
      })

      const unavailable = await prisma.message.create({
        data: {
          type: 'TICKET_DELIVERY', toEmail: 'missing-ticket@example.test', subject: 'Ticket copy',
          bodyHtml: '<p>Ticket attached.</p>', bodyText: 'Ticket attached.',
          data: { attachments: [{ kind: 'ticket', id: '00000000-0000-4000-8000-000000000000' }] },
        },
      })
      await flushOutbox()
      expect(await prisma.message.findUniqueOrThrow({ where: { id: unavailable.id } })).toMatchObject({ status: 'FAILED' })
      expect(attempts.some(email => email.to.email === unavailable.toEmail)).toBe(false)

      const other = await createUser(app, { verified: false })
      mode = 'permanent'
      await flushOutbox({ now: new Date() })
      const failed = await prisma.message.findFirstOrThrow({ where: { toEmail: other.email } })
      expect(failed).toMatchObject({ status: 'FAILED', errorMessage: '400 invalid address' })
    } finally {
      configureOutbox({
        provider: { name: 'log', send: async () => ({ providerMessageId: null }) },
      })
    }
  })

  it('advances stored event statuses over time', async () => {
    const { event } = await createEventWithRegistration(organiser)
    await prisma.event.update({
      where: { id: event.id },
      data: { startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 3_600_000) },
    })
    await syncEventStatuses()
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'ONGOING',
    )
    await syncEventStatuses(new Date(Date.now() + 2 * 3_600_000))
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'COMPLETED',
    )
  })
})

describe('certificates', () => {
  it('issues to checked-in attendees, verifies publicly and can be revoked', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const attended = await registeredTicket(form.slug)
    const absent = await registeredTicket(form.slug)
    await organiser.client.post(`/api/v1/events/${event.id}/check-in/scan`, {
      payload: ticketQrPayload(attended.ticket.code),
    })

    const badTemplate = await organiser.client.put(
      `/api/v1/events/${event.id}/certificates/template`,
      { title: 'Certificate', body: 'No placeholder here at all.' },
    )
    expect(errorCode(badTemplate)).toBe('TEMPLATE_MISSING_NAME')
    await organiser.client.put(`/api/v1/events/${event.id}/certificates/template`, {
      title: 'Certificate of Attendance',
      body: 'Awarded to {{participant_name}} for attending {{event_name}} on {{event_date}}.',
      signatoryName: 'Dr. Ada Example',
    })

    const issued = await organiser.client.post<{ issued: number }>(
      `/api/v1/events/${event.id}/certificates/issue`,
      { mode: 'attended' },
    )
    expect(issued.body.issued).toBe(1)
    // Running it again issues nothing new.
    expect(
      (
        await organiser.client.post<{ issued: number }>(
          `/api/v1/events/${event.id}/certificates/issue`,
          { mode: 'attended' },
        )
      ).body.issued,
    ).toBe(0)

    // An organiser can authorise a certificate for someone who did not check in.
    const selected = await organiser.client.post<{ issued: number }>(
      `/api/v1/events/${event.id}/certificates/issue`,
      {
        mode: 'selected',
        registrationIds: [absent.registration.id],
        sendEmail: false,
      },
    )
    expect(selected.body.issued).toBe(1)

    const certificate = await prisma.certificate.findFirstOrThrow({
      where: { registrationId: attended.registration.id },
    })
    expect(certificate.body).toBe(
      `Awarded to ${attended.details.full_name} for attending ${certificate.eventName} on ${certificate.eventDateText}.`,
    )

    const verify = await new TestClient(app).get<{ valid: boolean; recipientName: string }>(
      `/api/v1/public/certificates/${certificate.verificationCode}`,
    )
    expect(verify.body).toMatchObject({ valid: true, recipientName: attended.details.full_name })
    expect(JSON.stringify(verify.body)).not.toContain(attended.details.email)

    const pdf = await new TestClient(app).get(
      `/api/v1/public/certificates/${certificate.verificationCode}/pdf`,
    )
    expect(pdf.raw.subarray(0, 5).toString()).toBe('%PDF-')

    await organiser.client.post(
      `/api/v1/events/${event.id}/certificates/${certificate.id}/revoke`,
      { reason: 'Issued in error' },
    )
    const revoked = await new TestClient(app).get<{ valid: boolean }>(
      `/api/v1/public/certificates/${certificate.verificationCode}`,
    )
    expect(revoked.body.valid).toBe(false)
    expect(
      (await new TestClient(app).get(`/api/v1/public/certificates/NOPE-NOPE-NOPE`)).status,
    ).toBe(404)
  })
})

describe('administration', () => {
  it('is closed to everyone but administrators', async () => {
    const user = await createUser(app)
    for (const path of [
      '/api/v1/admin/stats',
      '/api/v1/admin/users',
      '/api/v1/admin/audit-logs',
      '/api/v1/admin/settings',
    ]) {
      expect((await user.client.get(path)).status).toBe(403)
      expect((await new TestClient(app).get(path)).status).toBe(401)
    }
  })

  it('suspends users, ends their sessions and hides their events', async () => {
    const admin = await createUser(app, { admin: true })
    const target = await createUser(app)
    const { event } = await createEventWithRegistration(target)

    const noReason = await admin.client.post(`/api/v1/admin/users/${target.id}/status`, {
      status: 'SUSPENDED',
    })
    expect(errorCode(noReason)).toBe('REASON_REQUIRED')
    const suspend = await admin.client.post(`/api/v1/admin/users/${target.id}/status`, {
      status: 'SUSPENDED',
      reason: 'Phishing',
    })
    expect(suspend.status).toBe(200)

    expect(
      (await target.client.get<{ authenticated: boolean }>('/api/v1/auth/session')).body
        .authenticated,
    ).toBe(false)
    expect((await new TestClient(app).get(`/api/v1/public/events/${event.slug}`)).status).toBe(404)
    expect(
      await prisma.auditLog.count({ where: { action: 'admin.user.suspend', targetId: target.id } }),
    ).toBe(1)

    const self = await admin.client.post(`/api/v1/admin/users/${admin.id}/status`, {
      status: 'SUSPENDED',
      reason: 'x',
    })
    expect(errorCode(self)).toBe('CANNOT_MODIFY_SELF')
  })

  it('removes reported events and resolves their reports', async () => {
    const admin = await createUser(app, { admin: true })
    const { event } = await createEventWithRegistration(organiser)
    await (
      await createUser(app)
    ).client.post(`/api/v1/public/events/${event.slug}/report`, { reason: 'SCAM' })

    const reports = await admin.client.get<{ items: Array<{ id: string; event: { id: string } }> }>(
      '/api/v1/admin/reports',
      { query: { status: 'OPEN' } },
    )
    expect(reports.body.items.some((report) => report.event.id === event.id)).toBe(true)

    await admin.client.post(`/api/v1/admin/events/${event.id}/moderation`, {
      status: 'REMOVED',
      note: 'Confirmed scam',
    })
    expect((await new TestClient(app).get(`/api/v1/public/events/${event.slug}`)).status).toBe(404)
    expect(await prisma.eventReport.count({ where: { eventId: event.id, status: 'OPEN' } })).toBe(0)
    expect(
      await prisma.notification.count({ where: { userId: organiser.id, type: 'EVENT_MODERATED' } }),
    ).toBeGreaterThan(0)

    // The organiser cannot bring a removed event back by republishing.
    await prisma.event.update({ where: { id: event.id }, data: { status: 'DRAFT' } })
    const republish = await organiser.client.post(`/api/v1/events/${event.id}/publish`)
    expect(errorCode(republish)).toBe('EVENT_REMOVED')
  })

  it('updates platform configuration with an audit trail', async () => {
    const admin = await createUser(app, { admin: true })
    const update = await admin.client.patch<{ allowSignups: boolean }>('/api/v1/admin/settings', {
      allowSignups: false,
    })
    expect(update.body.allowSignups).toBe(false)
    try {
      const blocked = await new TestClient(app).registerLegacy({
        ...CONSENT,
        email: `blocked-${Date.now()}@example.test`,
        username: `blocked${Date.now().toString(36)}`,
        displayName: 'Blocked',
        password: 'a-long-enough-passphrase',
      })
      expect(errorCode(blocked)).toBe('SIGNUPS_CLOSED')
    } finally {
      await admin.client.patch('/api/v1/admin/settings', { allowSignups: true })
    }
    const stats = await admin.client.get<{ users: number }>('/api/v1/admin/stats')
    expect(stats.body.users).toBeGreaterThan(0)
    const logs = await admin.client.get<{ items: Array<{ action: string }> }>(
      '/api/v1/admin/audit-logs',
      { query: { action: 'admin.settings' } },
    )
    expect(logs.body.items.length).toBeGreaterThanOrEqual(2)
  })
})
