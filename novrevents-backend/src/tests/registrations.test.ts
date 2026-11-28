import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../lib/db.js'
import { clearSettingsCache } from '../modules/admin/settings.service.js'
import { verifyTicketQr } from '../modules/tickets/ticket-credential.js'
import {
  createEventWithRegistration,
  createPublishedForm,
  createTestApp,
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
  // This suite publishes many events from one organiser; lift the per-day abuse limit for it.
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

const attendee = (n: number | string) => ({
  full_name: `Attendee ${n}`,
  email: `attendee-${n}-${Date.now()}@example.test`,
})
const tokenOf = (manageUrl: string) => manageUrl.split('/r/')[1] as string

describe('event registration', () => {
  it('requires registration forms to belong to an event and to collect name and email', async () => {
    const standalone = await organiser.client.post('/api/v1/forms', {
      title: 'Orphan',
      purpose: 'REGISTRATION',
    })
    expect(standalone.status).toBe(400)
    expect(errorCode(standalone)).toBe('EVENT_REQUIRED')

    const { event } = await createEventWithRegistration(organiser)
    const second = await organiser.client.post('/api/v1/forms', {
      title: 'Second',
      purpose: 'REGISTRATION',
      eventId: event.id,
    })
    expect(errorCode(second)).toBe('REGISTRATION_FORM_EXISTS')

    const form = await prisma.form.findFirstOrThrow({ where: { eventId: event.id } })
    const draft = await organiser.client.put(`/api/v1/forms/${form.id}/draft`, {
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
      ],
      rules: [],
    })
    expect(draft.status).toBe(200)
    const publish = await organiser.client.post(`/api/v1/forms/${form.id}/publish`)
    expect(publish.status).toBe(422)
    expect(JSON.stringify(publish.body)).toContain('attendee email')
  })

  it('registers a guest, issues a signed ticket and emails it', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const details = attendee('guest')
    const response = await submit(app, form.slug, details)
    expect(response.status).toBe(201)
    expect(response.body.registration?.status).toBe('CONFIRMED')

    const registration = await prisma.registration.findFirstOrThrow({
      where: { eventId: event.id },
      include: { ticket: true },
    })
    expect(registration).toMatchObject({
      status: 'CONFIRMED',
      userId: null,
      attendeeEmail: details.email,
    })
    expect(registration.ticket?.status).toBe('VALID')
    expect(registration.ticket?.code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/)
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).registeredCount,
    ).toBe(1)

    const email = await prisma.message.findFirstOrThrow({
      where: { toEmail: details.email, type: 'REGISTRATION_CONFIRMATION' },
    })
    expect(email.bodyText).toContain(registration.ticket?.code)
    expect(email.data).toMatchObject({
      attachments: [{ kind: 'ticket', id: registration.ticket?.id }],
    })

    // The private link works without an account and returns a downloadable PDF and QR code.
    const guest = new TestClient(app)
    const token = tokenOf(response.body.registration!.manageUrl)
    const view = await guest.get<{ status: string; canCancel: boolean; ticket: { code: string } }>(
      `/api/v1/public/registrations/${token}`,
    )
    expect(view.status).toBe(200)
    expect(view.body).toMatchObject({ status: 'CONFIRMED', canCancel: true })
    const pdf = await guest.get(`/api/v1/public/registrations/${token}/ticket`)
    expect(String(pdf.headers['content-type'])).toBe('application/pdf')
    expect(pdf.raw.subarray(0, 5).toString()).toBe('%PDF-')
    const qr = await guest.get(`/api/v1/public/registrations/${token}/ticket`, {
      query: { format: 'svg' },
    })
    expect(qr.raw.toString()).toContain('<svg')

    // A tampered link is rejected.
    const tampered = `${token.slice(0, -2)}xx`
    expect((await guest.get(`/api/v1/public/registrations/${tampered}`)).status).toBe(404)
  })

  it('lets event managers resend the same ticket once, to the registered address', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const person = attendee('delivery')
    await submit(app, form.slug, person)
    const registration = await prisma.registration.findFirstOrThrow({
      where: { eventId: event.id },
      include: { ticket: true },
    })
    const base = '/api/v1/events/' + event.id + '/registrations/' + registration.id
    const resend = base + '/resend-ticket'
    const history = base + '/ticket-delivery'
    const stranger = await createUser(app)
    expect((await stranger.client.get(history)).status).toBe(404)
    expect((await stranger.client.post(resend)).status).toBe(404)
    await prisma.eventTeamMember.create({
      data: { eventId: event.id, userId: stranger.id, role: 'STAFF' },
    })
    expect((await stranger.client.get(history)).status).toBe(403)
    expect((await stranger.client.post(resend)).status).toBe(403)
    expect(errorCode(await organiser.client.post(resend))).toBe('TICKET_EMAIL_PENDING')
    await prisma.message.updateMany({
      where: { registrationId: registration.id, type: 'REGISTRATION_CONFIRMATION' },
      data: { createdAt: new Date(Date.now() - 120_000), status: 'SENT', provider: 'gmail-api' },
    })
    const requests = await Promise.all([
      organiser.client.post(resend),
      organiser.client.post(resend),
    ])
    expect(requests.map((result) => result.status).sort()).toEqual([202, 409])
    const copy = await prisma.message.findFirstOrThrow({
      where: { registrationId: registration.id, type: 'TICKET_DELIVERY' },
    })
    expect(copy.toEmail).toBe(person.email)
    expect(copy.data).toMatchObject({
      attachments: [{ kind: 'ticket', id: registration.ticket!.id }],
    })
    expect(await prisma.ticket.count({ where: { registrationId: registration.id } })).toBe(1)
    const activity = await organiser.client.get<{ items: { resend: boolean; status: string }[] }>(
      history,
    )
    expect(activity.body.items).toMatchObject([
      { resend: true, status: 'QUEUED' },
      { resend: false, status: 'SENT' },
    ])
    const cancelled = await organiser.client.post(base + '/cancel', {
      reason: 'Delivery check complete',
    })
    expect(cancelled.status).toBe(200)
    expect((await prisma.message.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'CANCELLED',
    )
    expect(errorCode(await organiser.client.post(resend))).toBe('TICKET_UNAVAILABLE')
  })

  it('registers a signed-in user and lists the registration under their account', async () => {
    const user = await createUser(app)
    const { form } = await createEventWithRegistration(organiser)
    await submit(
      app,
      form.slug,
      { full_name: user.displayName, email: user.email },
      { client: user.client },
    )
    const mine = await user.client.get<{
      items: Array<{ status: string; ticket: { code: string } | null; event: { whenText: string } }>
    }>('/api/v1/me/registrations')
    expect(mine.body.items).toHaveLength(1)
    expect(mine.body.items[0]?.status).toBe('CONFIRMED')
    // Rendered in the event's own timezone, labelled (WAT or GMT+1 depending on the ICU data).
    expect(mine.body.items[0]?.event.whenText).toMatch(/\((WAT|GMT\+1)\)$/)
  })

  it('does not issue tickets for excluded or invalid registrations', async () => {
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
            key: 'age_ok',
            type: 'RADIO',
            label: 'Are you 18 or older?',
            required: true,
            stepKey: 'main',
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
          },
        ],
        rules: [
          {
            key: 'adults',
            type: 'EXCLUDE',
            name: 'Under 18',
            conditions: {
              combinator: 'AND',
              conditions: [{ fieldKey: 'age_ok', operator: 'equals', value: 'no' }],
            },
          },
        ],
      },
    })
    const excluded = await submit(app, form.slug, { ...attendee('minor'), age_ok: 'no' })
    expect(excluded.status).toBe(201)
    expect(excluded.body.registration).toBeNull()
    expect(excluded.body.message).not.toMatch(/registered|ticket has been/i)

    const invalid = await submit(app, form.slug, { full_name: 'No Email' })
    expect(invalid.status).toBe(400)

    expect(await prisma.registration.count({ where: { eventId: event.id } })).toBe(0)
    expect(await prisma.ticket.count({ where: { eventId: event.id } })).toBe(0)
    expect(
      await prisma.formSubmission.count({ where: { formId: form.id, qualification: 'EXCLUDED' } }),
    ).toBe(1)
  })

  it('enforces event capacity under simultaneous registrations', async () => {
    const capacity = 10
    const { event, form } = await createEventWithRegistration(organiser, { event: { capacity } })
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, index) => submit(app, form.slug, attendee(`race-${index}`))),
    )
    expect(results.filter((result) => result.status === 201)).toHaveLength(capacity)
    expect(results.filter((result) => errorCode(result) === 'EVENT_FULL')).toHaveLength(
      25 - capacity,
    )

    const stored = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
    expect(stored.registeredCount).toBe(capacity)
    expect(await prisma.registration.count({ where: { eventId: event.id } })).toBe(capacity)
    expect(await prisma.ticket.count({ where: { eventId: event.id } })).toBe(capacity)
    // A rejected registration leaves no response behind (the whole transaction rolled back).
    expect(await prisma.formSubmission.count({ where: { formId: form.id } })).toBe(capacity)

    const page = await new TestClient(app).get<{
      registration: { open: boolean; reason: string; spotsLeft: number }
    }>(`/api/v1/public/events/${event.slug}`)
    expect(page.body.registration).toMatchObject({ open: false, reason: 'FULL', spotsLeft: 0 })
  })

  it('enforces ticket type capacity and lets attendees choose a type', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const vip = await organiser.client.post<{ id: string }>(
      `/api/v1/events/${event.id}/ticket-types`,
      { name: 'VIP', capacity: 1 },
    )
    expect(vip.status).toBe(201)

    expect(
      (await submit(app, form.slug, attendee('vip-1'), { ticketTypeId: vip.body.id })).status,
    ).toBe(201)
    const second = await submit(app, form.slug, attendee('vip-2'), { ticketTypeId: vip.body.id })
    expect(errorCode(second)).toBe('TICKET_TYPE_FULL')
    const foreign = await submit(app, form.slug, attendee('vip-3'), {
      ticketTypeId: crypto.randomUUID(),
    })
    expect(errorCode(foreign)).toBe('INVALID_TICKET_TYPE')
  })

  it('allows one registration per email by default', async () => {
    const { form } = await createEventWithRegistration(organiser)
    const details = attendee('dup')
    expect((await submit(app, form.slug, details)).status).toBe(201)
    const again = await submit(app, form.slug, { ...details, full_name: 'Someone Else' })
    expect(errorCode(again)).toBe('DUPLICATE_SUBMISSION')
  })

  it('closes registration at the deadline', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    await prisma.event.update({
      where: { id: event.id },
      data: { registrationDeadline: new Date(Date.now() - 1000) },
    })
    const response = await submit(app, form.slug, attendee('late'))
    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('FORM_DEADLINE_PASSED')
  })
})

describe('approval workflow', () => {
  it('holds a seat without a ticket until the organiser approves', async () => {
    const { event, form } = await createEventWithRegistration(organiser, {
      settings: { autoAccept: false },
    })
    const details = attendee('review')
    const response = await submit(app, form.slug, details)
    expect(response.body.registration?.status).toBe('PENDING')
    expect(response.body.message).toContain('awaiting review')

    const registration = await prisma.registration.findFirstOrThrow({
      where: { eventId: event.id },
    })
    expect(await prisma.ticket.count({ where: { registrationId: registration.id } })).toBe(0)

    const approved = await organiser.client.post<{ status: string; ticket: { code: string } }>(
      `/api/v1/events/${event.id}/registrations/${registration.id}/approve`,
    )
    expect(approved.body.status).toBe('CONFIRMED')
    expect(approved.body.ticket.code).toBeTruthy()
    expect(
      await prisma.message.count({
        where: { toEmail: details.email, type: 'REGISTRATION_CONFIRMATION' },
      }),
    ).toBe(1)
    const submission = await prisma.formSubmission.findFirstOrThrow({ where: { formId: form.id } })
    expect(submission.decision).toBe('ACCEPTED')
  })

  it('frees the seat when a pending registration is declined', async () => {
    const { event, form } = await createEventWithRegistration(organiser, {
      settings: { autoAccept: false },
      event: { capacity: 1 },
    })
    await submit(app, form.slug, attendee('declined'))
    const registration = await prisma.registration.findFirstOrThrow({
      where: { eventId: event.id },
    })
    expect(errorCode(await submit(app, form.slug, attendee('waiting')))).toBe('EVENT_FULL')

    const declined = await organiser.client.post<{ status: string; ticket: null }>(
      `/api/v1/events/${event.id}/registrations/${registration.id}/decline`,
    )
    expect(declined.body).toMatchObject({ status: 'DECLINED', ticket: null })
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).registeredCount,
    ).toBe(0)
    expect((await submit(app, form.slug, attendee('next'))).status).toBe(201)
  })
})

describe('cancellation', () => {
  it('lets a guest cancel through their link, voiding the ticket and freeing the seat', async () => {
    const { event, form } = await createEventWithRegistration(organiser, { event: { capacity: 1 } })
    const details = attendee('cancel')
    const response = await submit(app, form.slug, details)
    const token = tokenOf(response.body.registration!.manageUrl)

    const cancelled = await new TestClient(app).post<{ status: string; canCancel: boolean }>(
      `/api/v1/public/registrations/${token}/cancel`,
    )
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', canCancel: false })

    const ticket = await prisma.ticket.findFirstOrThrow({ where: { eventId: event.id } })
    expect(ticket.status).toBe('VOID')
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).registeredCount,
    ).toBe(0)
    expect(
      (await new TestClient(app).get(`/api/v1/public/registrations/${token}/ticket`)).status,
    ).toBe(409)

    // The same person may register again after cancelling.
    expect((await submit(app, form.slug, details)).status).toBe(201)
  })

  it('emails every attendee and voids tickets when the event is cancelled', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    const a = attendee('ev-cancel-a')
    const b = attendee('ev-cancel-b')
    await submit(app, form.slug, a)
    await submit(app, form.slug, b)
    await organiser.client.post(`/api/v1/events/${event.id}/cancel`, {
      reason: 'Speaker illness',
      notifyAttendees: true,
    })

    expect(await prisma.ticket.count({ where: { eventId: event.id, status: 'VALID' } })).toBe(0)
    const notices = await prisma.message.findMany({
      where: { eventId: event.id, type: 'EVENT_CANCELLATION' },
    })
    expect(notices.map((notice) => notice.toEmail).sort()).toEqual([a.email, b.email].sort())
    expect(notices[0]?.bodyText).toContain('Speaker illness')
  })
})

describe('organiser attendee list', () => {
  it('lists, searches and exports attendees, and hides them from outsiders', async () => {
    const { event, form } = await createEventWithRegistration(organiser)
    await submit(app, form.slug, {
      full_name: 'Findable Person',
      email: `findable-${Date.now()}@example.test`,
    })
    await submit(app, form.slug, attendee('other'))

    const search = await organiser.client.get<{
      items: Array<{ attendeeName: string }>
      total: number
    }>(`/api/v1/events/${event.id}/registrations`, { query: { q: 'findable' } })
    expect(search.body.items.map((item) => item.attendeeName)).toEqual(['Findable Person'])

    const csv = await organiser.client.get(`/api/v1/events/${event.id}/registrations/export`)
    expect(csv.raw.toString()).toContain('Findable Person')

    const outsider = await createUser(app)
    expect((await outsider.client.get(`/api/v1/events/${event.id}/registrations`)).status).toBe(404)
  })
})

describe('ticket credential', () => {
  it('accepts only genuine, unmodified QR payloads', async () => {
    const { form } = await createEventWithRegistration(organiser)
    await submit(app, form.slug, attendee('qr'))
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { registration: { submission: { formId: form.id } } },
    })
    const { ticketQrPayload } = await import('../modules/tickets/ticket-credential.js')
    const payload = ticketQrPayload(ticket.code)

    expect(verifyTicketQr(payload)).toBe(ticket.code)
    expect(verifyTicketQr(payload.replace(ticket.code, 'AAAA-BBBB-CCCC'))).toBeNull()
    // Change the final character to a different one (the signature may already end in "x").
    const lastChar = payload.slice(-1)
    expect(verifyTicketQr(payload.slice(0, -1) + (lastChar === 'x' ? 'y' : 'x'))).toBeNull()
    expect(verifyTicketQr(`NOVR1:${ticket.code}`)).toBeNull()
    expect(verifyTicketQr('https://example.test/u/someone')).toBeNull()
  })

  it('uses the shared engine for every application type', async () => {
    for (const purpose of [
      'VOLUNTEER',
      'SPEAKER',
      'JUDGE',
      'SPONSORSHIP',
      'WORKSHOP',
      'FEEDBACK',
      'GENERAL',
    ]) {
      const form = await createPublishedForm(organiser, { purpose, title: `${purpose} form` })
      expect(form.purpose).toBe(purpose)
    }
  })
})
