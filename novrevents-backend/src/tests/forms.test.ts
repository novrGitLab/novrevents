import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../lib/db.js'
import {
  createDraftEvent,
  createPublishedForm,
  createTestApp,
  createUser,
  errorCode,
  submit,
  TestClient,
  type FormDetail,
  type TestUser,
} from './helpers.js'

let app: FastifyInstance
let owner: TestUser

beforeAll(async () => {
  app = await createTestApp()
  owner = await createUser(app)
})

afterAll(async () => {
  await app.close()
})

const step = { key: 'main', title: 'Main' }
const nameField = {
  key: 'full_name',
  type: 'SHORT_TEXT',
  label: 'Name',
  required: true,
  role: 'RESPONDENT_NAME',
  stepKey: 'main',
}
const emailField = {
  key: 'email',
  type: 'EMAIL',
  label: 'Email',
  required: true,
  role: 'RESPONDENT_EMAIL',
  stepKey: 'main',
}
const typeField = {
  key: 'attendee_type',
  type: 'RADIO',
  label: 'I am a',
  required: true,
  stepKey: 'main',
  options: [
    { value: 'student', label: 'Student' },
    { value: 'professional', label: 'Professional' },
    { value: 'recruiter', label: 'Recruiter' },
  ],
}
const schoolField = {
  key: 'school',
  type: 'SHORT_TEXT',
  label: 'School',
  required: true,
  stepKey: 'main',
}

const applicationDefinition = {
  steps: [step],
  fields: [nameField, emailField, typeField, schoolField],
  rules: [
    {
      key: 'show_school',
      type: 'SHOW',
      targetFieldKeys: ['school'],
      conditions: {
        combinator: 'AND',
        conditions: [{ fieldKey: 'attendee_type', operator: 'equals', value: 'student' }],
      },
    },
    {
      key: 'no_recruiters',
      type: 'EXCLUDE',
      name: 'Recruiters are not eligible',
      conditions: {
        combinator: 'OR',
        conditions: [{ fieldKey: 'attendee_type', operator: 'equals', value: 'recruiter' }],
      },
    },
  ],
}

describe('form builder', () => {
  it('creates a form from a purpose template with a stable public address', async () => {
    const created = await owner.client.post<FormDetail>('/api/v1/forms', {
      title: 'Call for Speakers',
      purpose: 'SPEAKER',
    })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('DRAFT')
    expect(created.body.definition.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(['full_name', 'email', 'talk_title', 'abstract']),
    )
    // Not reachable before it is published.
    expect(
      (await new TestClient(app).get(`/api/v1/public/forms/${created.body.slug}`)).status,
    ).toBe(404)

    const published = await owner.client.post<FormDetail>(
      `/api/v1/forms/${created.body.id}/publish`,
    )
    expect(published.body.status).toBe('PUBLISHED')
    expect(published.body.slug).toBe(created.body.slug)
    expect(
      (await new TestClient(app).get(`/api/v1/public/forms/${created.body.slug}`)).status,
    ).toBe(200)
  })

  it('rejects invalid definitions with precise messages', async () => {
    const form = await owner.client.post<FormDetail>('/api/v1/forms', { title: 'Broken' })
    const response = await owner.client.put(`/api/v1/forms/${form.body.id}/draft`, {
      steps: [step],
      fields: [nameField],
      rules: [
        {
          key: 'bad',
          type: 'EXCLUDE',
          conditions: {
            combinator: 'AND',
            conditions: [{ fieldKey: 'missing', operator: 'is_empty' }],
          },
        },
      ],
    })
    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('INVALID_DEFINITION')
    expect(JSON.stringify(response.body)).toContain('no longer exists')
  })

  it('keeps published versions immutable and records the version each response answered', async () => {
    const form = await createPublishedForm(owner, {
      definition: { steps: [step], fields: [nameField, emailField], rules: [] },
    })
    expect(form.publishedVersion).toBe(1)
    await submit(app, form.slug, { full_name: 'First', email: 'first@example.test' })

    const edited = await owner.client.put<FormDetail>(`/api/v1/forms/${form.id}/draft`, {
      steps: [step],
      fields: [
        nameField,
        emailField,
        { key: 'company', type: 'SHORT_TEXT', label: 'Company', required: false, stepKey: 'main' },
      ],
      rules: [],
    })
    expect(edited.body).toMatchObject({ publishedVersion: 1, draftVersion: 2 })
    // The live form still serves version 1 until the draft is published.
    const live = await new TestClient(app).get<{ definition: { fields: unknown[] } }>(
      `/api/v1/public/forms/${form.slug}`,
    )
    expect(live.body.definition.fields).toHaveLength(2)

    const republished = await owner.client.post<FormDetail>(`/api/v1/forms/${form.id}/publish`)
    expect(republished.body.publishedVersion).toBe(2)
    await submit(app, form.slug, {
      full_name: 'Second',
      email: 'second@example.test',
      company: 'Acme',
    })

    const rows = await prisma.formSubmission.findMany({
      where: { formId: form.id },
      orderBy: { submittedAt: 'asc' },
      include: { version: true },
    })
    expect(rows.map((row) => row.version.version)).toEqual([1, 2])
    const versions = await prisma.formVersion.findMany({
      where: { formId: form.id },
      include: { fields: true },
    })
    expect(versions.find((v) => v.version === 1)?.fields).toHaveLength(2)
  })

  it('duplicates a form without its responses', async () => {
    const form = await createPublishedForm(owner, { definition: applicationDefinition })
    await submit(app, form.slug, {
      full_name: 'A',
      email: 'a@example.test',
      attendee_type: 'professional',
    })
    const copy = await owner.client.post<FormDetail>(`/api/v1/forms/${form.id}/duplicate`)
    expect(copy.status).toBe(201)
    expect(copy.body.status).toBe('DRAFT')
    expect(copy.body.slug).not.toBe(form.slug)
    expect(copy.body.counts.received).toBe(0)
    expect(copy.body.definition.rules).toHaveLength(2)
  })

  it('unpublishes a form while keeping its address', async () => {
    const form = await createPublishedForm(owner)
    await owner.client.post(`/api/v1/forms/${form.id}/unpublish`)
    const page = await new TestClient(app).get<{
      open: boolean
      reason: string
      definition: unknown
    }>(`/api/v1/public/forms/${form.slug}`)
    expect(page.status).toBe(200)
    expect(page.body).toMatchObject({ open: false, reason: 'NOT_PUBLISHED', definition: null })
    const response = await submit(app, form.slug, { full_name: 'Late', email: 'late@example.test' })
    expect(response.status).toBe(409)
  })
})

describe('guest submissions', () => {
  it('accepts a response from someone without an account', async () => {
    const form = await createPublishedForm(owner, {
      definition: { steps: [step], fields: [nameField, emailField], rules: [] },
      settings: { confirmationMessage: 'Thanks — see you there!' },
    })
    const response = await submit(app, form.slug, {
      full_name: 'Guest Person',
      email: 'Guest@Example.test',
    })
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      status: 'RECEIVED',
      message: 'Thanks — see you there!',
      registration: null,
    })

    const stored = await prisma.formSubmission.findFirstOrThrow({
      where: { formId: form.id },
      include: { answers: true },
    })
    expect(stored).toMatchObject({
      userId: null,
      respondentEmail: 'guest@example.test',
      qualification: 'QUALIFYING',
      decision: 'ACCEPTED',
    })
    expect(stored.answers).toHaveLength(2)
    const receipt = await prisma.message.findFirst({
      where: { toEmail: 'guest@example.test', type: 'SUBMISSION_RECEIPT' },
    })
    expect(receipt).not.toBeNull()
  })

  it('links the response to the account when the respondent is signed in', async () => {
    const respondent = await createUser(app)
    const form = await createPublishedForm(owner, {
      definition: { steps: [step], fields: [nameField, emailField], rules: [] },
    })
    await submit(
      app,
      form.slug,
      { full_name: 'Member', email: respondent.email },
      { client: respondent.client },
    )
    const stored = await prisma.formSubmission.findFirstOrThrow({ where: { formId: form.id } })
    expect(stored.userId).toBe(respondent.id)
  })

  it('validates answers on the server and stores nothing on failure', async () => {
    const form = await createPublishedForm(owner, { definition: applicationDefinition })
    const response = await submit(app, form.slug, {
      full_name: '',
      email: 'nope',
      attendee_type: 'astronaut',
    })
    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('VALIDATION_ERROR')
    const paths = (
      response.body as unknown as { error: { details: Array<{ path: string }> } }
    ).error.details.map((d) => d.path)
    expect(paths).toEqual(['answers.full_name', 'answers.email', 'answers.attendee_type'])
    expect(await prisma.formSubmission.count({ where: { formId: form.id } })).toBe(0)
  })

  it('returns the original result when a submission is retried with the same key', async () => {
    const form = await createPublishedForm(owner, {
      definition: { steps: [step], fields: [nameField, emailField], rules: [] },
    })
    const idempotencyKey = crypto.randomUUID()
    const first = await submit(
      app,
      form.slug,
      { full_name: 'Retry', email: 'retry@example.test' },
      { idempotencyKey },
    )
    const second = await submit(
      app,
      form.slug,
      { full_name: 'Retry', email: 'retry@example.test' },
      { idempotencyKey },
    )
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(second.body).toEqual(first.body)
    expect(await prisma.formSubmission.count({ where: { formId: form.id } })).toBe(1)
  })

  it('rejects a submission against an outdated version', async () => {
    const form = await createPublishedForm(owner, {
      definition: { steps: [step], fields: [nameField, emailField], rules: [] },
    })
    const response = await submit(
      app,
      form.slug,
      { full_name: 'X', email: 'x@example.test' },
      { versionId: crypto.randomUUID() },
    )
    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('FORM_UPDATED')
  })

  it('never sends exclusion rules to respondents', async () => {
    const form = await createPublishedForm(owner, { definition: applicationDefinition })
    const page = await new TestClient(app).get<{ definition: { rules: Array<{ type: string }> } }>(
      `/api/v1/public/forms/${form.slug}`,
    )
    expect(page.body.definition.rules.map((rule) => rule.type)).toEqual(['SHOW'])
    expect(JSON.stringify(page.body)).not.toContain('Recruiters are not eligible')
  })
})

describe('conditional questions', () => {
  it('requires a conditional question only when it is shown, and drops hidden answers', async () => {
    const form = await createPublishedForm(owner, { definition: applicationDefinition })

    const missingSchool = await submit(app, form.slug, {
      full_name: 'S',
      email: 's@example.test',
      attendee_type: 'student',
    })
    expect(missingSchool.status).toBe(400)
    expect(JSON.stringify(missingSchool.body)).toContain('answers.school')

    const professional = await submit(app, form.slug, {
      full_name: 'P',
      email: 'p@example.test',
      attendee_type: 'professional',
      school: 'Should be discarded',
    })
    expect(professional.status).toBe(201)
    const answers = await prisma.submissionAnswer.findMany({
      where: { submission: { formId: form.id } },
    })
    expect(answers.map((answer) => answer.fieldKey)).not.toContain('school')
  })
})

describe('exclusion rules', () => {
  it('stores excluded responses, gives a neutral acknowledgement and keeps them separate', async () => {
    const form = await createPublishedForm(owner, {
      definition: applicationDefinition,
      settings: { confirmationMessage: 'Congratulations, you are accepted!' },
    })
    const excluded = await submit(app, form.slug, {
      full_name: 'R',
      email: 'r@example.test',
      attendee_type: 'recruiter',
    })
    expect(excluded.status).toBe(201)
    // No false promise of acceptance.
    expect(excluded.body.status).toBe('RECEIVED')
    expect(excluded.body.message).toBe('Thank you. Your response has been received.')
    expect(excluded.body.message).not.toContain('accepted')

    const accepted = await submit(app, form.slug, {
      full_name: 'P',
      email: 'p@example.test',
      attendee_type: 'professional',
    })
    expect(accepted.body.message).toBe('Congratulations, you are accepted!')

    const row = await prisma.formSubmission.findFirstOrThrow({
      where: { formId: form.id, respondentEmail: 'r@example.test' },
    })
    expect(row.qualification).toBe('EXCLUDED')
    expect(row.decision).toBe('PENDING')
    expect(row.exclusionReasons).toEqual([
      { key: 'no_recruiters', name: 'Recruiters are not eligible' },
    ])

    const receipt = await prisma.message.findFirstOrThrow({
      where: { toEmail: 'r@example.test', type: 'SUBMISSION_RECEIPT' },
    })
    expect(receipt.bodyText).toContain('confirms receipt only')

    const list = (qualification: string) =>
      owner.client.get<{ items: Array<{ respondentEmail: string }>; total: number }>(
        `/api/v1/forms/${form.id}/submissions`,
        {
          query: { qualification },
        },
      )
    expect((await list('EXCLUDED')).body.items.map((item) => item.respondentEmail)).toEqual([
      'r@example.test',
    ])
    expect((await list('QUALIFYING')).body.items.map((item) => item.respondentEmail)).toEqual([
      'p@example.test',
    ])
    expect((await list('ALL')).body.total).toBe(2)

    const stats = await owner.client.get<Record<string, number>>(
      `/api/v1/forms/${form.id}/submissions/stats`,
    )
    expect(stats.body).toMatchObject({ received: 2, qualifying: 1, excluded: 1, accepted: 1 })
  })
})

describe('response limits', () => {
  it('counts only qualifying responses toward the limit', async () => {
    const form = await createPublishedForm(owner, {
      definition: applicationDefinition,
      settings: { responseLimit: 1 },
    })
    // Excluded responses do not use up a place.
    await submit(app, form.slug, {
      full_name: 'R',
      email: 'r@example.test',
      attendee_type: 'recruiter',
    })
    const first = await submit(app, form.slug, {
      full_name: 'A',
      email: 'a@example.test',
      attendee_type: 'professional',
    })
    expect(first.status).toBe(201)
    const second = await submit(app, form.slug, {
      full_name: 'B',
      email: 'b@example.test',
      attendee_type: 'professional',
    })
    expect(second.status).toBe(409)
    expect(errorCode(second)).toBe('FORM_FULL')

    const page = await new TestClient(app).get<{ open: boolean; reason: string }>(
      `/api/v1/public/forms/${form.slug}`,
    )
    expect(page.body).toMatchObject({ open: false, reason: 'FULL' })
  })

  it('closes the form at the configured date', async () => {
    const form = await createPublishedForm(owner, {
      definition: { steps: [step], fields: [nameField, emailField], rules: [] },
    })
    await prisma.form.update({
      where: { id: form.id },
      data: { closesAt: new Date(Date.now() - 1000) },
    })
    const response = await submit(app, form.slug, { full_name: 'Late', email: 'late@example.test' })
    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('FORM_CLOSED')
  })

  it('never exceeds the limit under simultaneous submissions', async () => {
    const limit = 50
    const form = await createPublishedForm(owner, {
      definition: { steps: [step], fields: [nameField, emailField], rules: [] },
      settings: { responseLimit: limit },
    })
    const attempts = 80
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, index) =>
        submit(app, form.slug, {
          full_name: `Racer ${index}`,
          email: `racer${index}@example.test`,
        }),
      ),
    )
    const statuses = results.map((result) => result.status)
    expect(statuses.filter((status) => status === 201)).toHaveLength(limit)
    expect(statuses.filter((status) => status === 409)).toHaveLength(attempts - limit)
    expect(
      await prisma.formSubmission.count({
        where: { formId: form.id, qualification: 'QUALIFYING' },
      }),
    ).toBe(limit)
    expect((await prisma.form.findUniqueOrThrow({ where: { id: form.id } })).qualifyingCount).toBe(
      limit,
    )
  })
})

describe('duplicate submissions', () => {
  it('rejects a second response with the same configured answers, even simultaneously', async () => {
    const form = await createPublishedForm(owner, {
      definition: { steps: [step], fields: [nameField, emailField], rules: [] },
      settings: { duplicateFieldKeys: ['email'] },
    })
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        submit(app, form.slug, { full_name: 'Twin', email: 'twin@example.test' }),
      ),
    )
    expect(results.filter((result) => result.status === 201)).toHaveLength(1)
    expect(results.filter((result) => errorCode(result) === 'DUPLICATE_SUBMISSION')).toHaveLength(4)

    // Comparison ignores case and surrounding whitespace.
    const variant = await submit(app, form.slug, {
      full_name: 'Twin',
      email: '  TWIN@example.test ',
    })
    expect(errorCode(variant)).toBe('DUPLICATE_SUBMISSION')
  })
})

describe('response management', () => {
  it('searches, filters, exports and deletes responses', async () => {
    const form = await createPublishedForm(owner, { definition: applicationDefinition })
    await submit(app, form.slug, {
      full_name: 'Alice Analyst',
      email: 'alice@example.test',
      attendee_type: 'professional',
    })
    await submit(app, form.slug, {
      full_name: 'Sam Student',
      email: 'sam@example.test',
      attendee_type: 'student',
      school: 'FUT Minna',
    })
    await submit(app, form.slug, {
      full_name: '=HYPERLINK("http://evil")',
      email: 'eve@example.test',
      attendee_type: 'professional',
    })

    const search = await owner.client.get<{ items: Array<{ respondentName: string }> }>(
      `/api/v1/forms/${form.id}/submissions`,
      {
        query: { q: 'minna' },
      },
    )
    expect(search.body.items.map((item) => item.respondentName)).toEqual(['Sam Student'])

    const byAnswer = await owner.client.get<{ total: number }>(
      `/api/v1/forms/${form.id}/submissions`,
      {
        query: { fieldKey: 'attendee_type', fieldValue: 'professional' },
      },
    )
    expect(byAnswer.body.total).toBe(2)

    const sorted = await owner.client.get<{ items: Array<{ respondentName: string }> }>(
      `/api/v1/forms/${form.id}/submissions`,
      {
        query: { sort: 'name' },
      },
    )
    const names = sorted.body.items.map((item) => item.respondentName)
    expect(names).toHaveLength(3)
    expect(names).toContain('=HYPERLINK("http://evil")')
    expect(names.filter((name) => name === 'Alice Analyst' || name === 'Sam Student')).toEqual([
      'Alice Analyst',
      'Sam Student',
    ])

    const csv = await owner.client.get(`/api/v1/forms/${form.id}/submissions/export`)
    expect(csv.status).toBe(200)
    expect(String(csv.headers['content-type'])).toContain('text/csv')
    const text = csv.raw.toString('utf8')
    expect(text).toContain('Sam Student')
    expect(text).toContain('FUT Minna')
    // Formula injection is neutralised.
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`)

    const stats = await owner.client.get<{
      choices: Array<{ fieldKey: string; options: Array<{ value: string; count: number }> }>
    }>(`/api/v1/forms/${form.id}/submissions/stats`)
    const typeStats = stats.body.choices.find((choice) => choice.fieldKey === 'attendee_type')
    expect(typeStats?.options.find((option) => option.value === 'professional')?.count).toBe(2)

    const all = await owner.client.get<{ items: Array<{ id: string }> }>(
      `/api/v1/forms/${form.id}/submissions`,
    )
    const removed = await owner.client.post<{ deleted: number }>(
      `/api/v1/forms/${form.id}/submissions/delete`,
      {
        ids: [all.body.items[0]?.id],
      },
    )
    expect(removed.body.deleted).toBe(1)
    expect(await prisma.formSubmission.count({ where: { formId: form.id } })).toBe(2)
    expect(
      await prisma.auditLog.count({ where: { targetId: form.id, action: 'submission.delete' } }),
    ).toBe(1)
  })

  it('keeps responses private to the form team', async () => {
    const form = await createPublishedForm(owner, { definition: applicationDefinition })
    await submit(app, form.slug, {
      full_name: 'Private Person',
      email: 'private@example.test',
      attendee_type: 'professional',
    })
    const stranger = await createUser(app)
    const base = `/api/v1/forms/${form.id}`
    const attempts = await Promise.all([
      stranger.client.get(base),
      stranger.client.get(`${base}/submissions`),
      stranger.client.get(`${base}/submissions/export`),
      stranger.client.get(`${base}/submissions/stats`),
      new TestClient(app).get(`${base}/submissions`),
    ])
    expect(attempts.map((response) => response.status)).toEqual([404, 404, 404, 404, 401])
    const page = await new TestClient(app).get(`/api/v1/public/forms/${form.slug}`)
    expect(JSON.stringify(page.body)).not.toContain('private@example.test')
  })

  it('gives event managers access to event forms but not check-in staff', async () => {
    const eventOwner = await createUser(app)
    const manager = await createUser(app)
    const staff = await createUser(app)
    const event = await createDraftEvent(eventOwner)
    await eventOwner.client.post(`/api/v1/events/${event.id}/team`, {
      username: manager.username,
      role: 'MANAGER',
    })
    await eventOwner.client.post(`/api/v1/events/${event.id}/team`, {
      username: staff.username,
      role: 'STAFF',
    })
    const form = await createPublishedForm(eventOwner, { purpose: 'VOLUNTEER', eventId: event.id })

    expect((await manager.client.get(`/api/v1/forms/${form.id}/submissions`)).status).toBe(200)
    expect((await staff.client.get(`/api/v1/forms/${form.id}/submissions`)).status).toBe(404)
  })

  it('accepts uploads only when the content matches an allowed type, and serves them privately', async () => {
    const form = await createPublishedForm(owner, {
      definition: {
        steps: [step],
        fields: [
          nameField,
          emailField,
          {
            key: 'cv',
            type: 'FILE',
            label: 'CV',
            required: true,
            stepKey: 'main',
            validation: { allowedExtensions: ['pdf'] },
          },
        ],
        rules: [],
      },
    })
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
    const send = (filename: string, content: Buffer) =>
      new TestClient(app).request<{ status: string }>(
        'POST',
        `/api/v1/public/forms/${form.slug}/submissions/upload`,
        {
          multipart: {
            fields: {
              payload: JSON.stringify({
                answers: { full_name: 'Up Loader', email: 'up@example.test' },
                idempotencyKey: crypto.randomUUID(),
              }),
            },
            files: [{ field: 'file:cv', filename, contentType: 'application/pdf', content }],
          },
        },
      )

    const fake = await send('cv.pdf', Buffer.from('MZ\x90\x00 this is really an executable'))
    expect(fake.status).toBe(415)
    // An extension the question does not allow is a field-level validation error.
    const wrongType = await send('cv.docx', pdf)
    expect(wrongType.status).toBe(400)
    expect(JSON.stringify(wrongType.body)).toContain('Allowed file types: pdf.')
    expect(await prisma.formSubmission.count({ where: { formId: form.id } })).toBe(0)

    const ok = await send('../../My CV.pdf', pdf)
    expect(ok.status).toBe(201)

    const listed = await owner.client.get<{
      items: Array<{
        id: string
        answers: Array<{ fieldKey: string; files: Array<{ id: string; name: string }> | null }>
      }>
    }>(`/api/v1/forms/${form.id}/submissions`)
    const submission = listed.body.items[0]!
    const file = submission.answers.find((answer) => answer.fieldKey === 'cv')?.files?.[0]
    expect(file?.name).toBe('My CV.pdf')
    expect(JSON.stringify(listed.body)).not.toContain('private/')

    const url = `/api/v1/forms/${form.id}/submissions/${submission.id}/files/${file?.id}`
    const download = await owner.client.get(url)
    expect(download.status).toBe(200)
    expect(String(download.headers['content-disposition'])).toContain('attachment')
    expect(download.raw.subarray(0, 5).toString()).toBe('%PDF-')
    expect((await (await createUser(app)).client.get(url)).status).toBe(404)
  })
})
