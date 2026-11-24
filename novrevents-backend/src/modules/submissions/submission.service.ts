import { toCsv } from '../../lib/csv.js'
import { prisma, type Prisma } from '../../lib/db.js'
import { conflict, notFound } from '../../lib/errors.js'
import { deleteStoredFiles, storage } from '../../lib/storage/index.js'
import { requireFormAccess } from '../forms/form-access.js'
import { fieldCatalogue } from '../forms/form-store.js'

/**
 * Submission vocabulary (shown to organisers and used by analytics):
 *  received    every stored response
 *  qualifying  received responses that matched no exclusion rule; only these count toward the limit
 *  excluded    received responses that matched at least one exclusion rule (kept, never discarded)
 *  accepted    qualifying responses with an ACCEPTED decision (automatic or by an organiser)
 */
export type QualificationFilter = 'ALL' | 'QUALIFYING' | 'EXCLUDED'

export interface ListQuery {
  page: number
  pageSize: number
  qualification: QualificationFilter
  decision?: 'PENDING' | 'ACCEPTED' | 'DECLINED'
  q?: string
  from?: string
  to?: string
  sort: 'newest' | 'oldest' | 'name'
  /** Filter on one answer: `fieldKey` must equal `fieldValue` (option value or exact text). */
  fieldKey?: string
  fieldValue?: string
}

interface StoredFile {
  id: string
  key: string
  name: string
  size: number
  mimeType: string
}

function whereFor(
  formId: string,
  query: Omit<ListQuery, 'page' | 'pageSize' | 'sort'>,
): Prisma.FormSubmissionWhereInput {
  const filters: Prisma.FormSubmissionWhereInput[] = [{ formId }]
  if (query.qualification !== 'ALL') filters.push({ qualification: query.qualification })
  if (query.decision) filters.push({ decision: query.decision })
  if (query.from) filters.push({ submittedAt: { gte: new Date(`${query.from}T00:00:00.000Z`) } })
  if (query.to) filters.push({ submittedAt: { lte: new Date(`${query.to}T23:59:59.999Z`) } })
  if (query.q) {
    const contains = { contains: query.q, mode: 'insensitive' as const }
    filters.push({
      OR: [
        { respondentName: contains },
        { respondentEmail: contains },
        { answers: { some: { valueText: contains } } },
      ],
    })
  }
  if (query.fieldKey && query.fieldValue !== undefined) {
    filters.push({
      answers: {
        some: {
          fieldKey: query.fieldKey,
          OR: [
            { valueText: { equals: query.fieldValue, mode: 'insensitive' } },
            { valueJson: { path: ['selected'], array_contains: [query.fieldValue] } },
          ],
        },
      },
    })
  }
  return { AND: filters }
}

const ORDER: Record<ListQuery['sort'], Prisma.FormSubmissionOrderByWithRelationInput[]> = {
  newest: [{ submittedAt: 'desc' }, { id: 'desc' }],
  oldest: [{ submittedAt: 'asc' }, { id: 'asc' }],
  name: [{ respondentName: { sort: 'asc', nulls: 'last' } }, { submittedAt: 'asc' }],
}

function answerOut(answer: {
  fieldKey: string
  valueText: string | null
  valueNumber: number | null
  valueJson: unknown
}) {
  const json = answer.valueJson as { selected?: string[]; files?: StoredFile[] } | null
  return {
    fieldKey: answer.fieldKey,
    text: answer.valueText,
    number: answer.valueNumber,
    selected: json?.selected ?? null,
    // Storage keys stay on the server; files are downloaded through an authorised route.
    files:
      json?.files?.map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
      })) ?? null,
  }
}

const submissionInclude = {
  answers: { select: { fieldKey: true, valueText: true, valueNumber: true, valueJson: true } },
  version: { select: { version: true } },
  registration: { select: { id: true, status: true } },
} satisfies Prisma.FormSubmissionInclude

type SubmissionRow = Prisma.FormSubmissionGetPayload<{ include: typeof submissionInclude }>

function toSubmission(row: SubmissionRow) {
  return {
    id: row.id,
    respondentName: row.respondentName,
    respondentEmail: row.respondentEmail,
    isGuest: row.userId === null,
    qualification: row.qualification,
    decision: row.decision,
    exclusionReasons:
      (row.exclusionReasons as Array<{ key: string; name: string | null }> | null) ?? [],
    formVersion: row.version.version,
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt,
    registration: row.registration,
    answers: row.answers.map(answerOut),
  }
}

export async function listSubmissions(userId: string, formId: string, query: ListQuery) {
  await requireFormAccess(userId, formId)
  const where = whereFor(formId, query)
  const [rows, total] = await Promise.all([
    prisma.formSubmission.findMany({
      where,
      orderBy: ORDER[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: submissionInclude,
    }),
    prisma.formSubmission.count({ where }),
  ])
  return { items: rows.map(toSubmission), total, fields: await fieldCatalogue(formId) }
}

export async function getSubmission(userId: string, formId: string, submissionId: string) {
  await requireFormAccess(userId, formId)
  const row = await prisma.formSubmission.findFirst({
    where: { id: submissionId, formId },
    include: submissionInclude,
  })
  if (!row) throw notFound('Response')
  return toSubmission(row)
}

/** Accept or decline a qualifying response to a non-registration form (e.g. a speaker application). */
export async function decideSubmission(
  userId: string,
  formId: string,
  submissionId: string,
  decision: 'ACCEPTED' | 'DECLINED' | 'PENDING',
) {
  await requireFormAccess(userId, formId)
  const row = await prisma.formSubmission.findFirst({
    where: { id: submissionId, formId },
    select: { qualification: true, registration: { select: { id: true } } },
  })
  if (!row) throw notFound('Response')
  if (row.registration) {
    throw conflict(
      'Use the registrations page to approve or decline registrations.',
      'USE_REGISTRATIONS',
    )
  }
  if (row.qualification === 'EXCLUDED' && decision === 'ACCEPTED') {
    throw conflict('An excluded response cannot be accepted.', 'EXCLUDED_SUBMISSION')
  }
  await prisma.formSubmission.update({
    where: { id: submissionId },
    data: {
      decision,
      decidedAt: decision === 'PENDING' ? null : new Date(),
      decidedById: decision === 'PENDING' ? null : userId,
    },
  })
  return getSubmission(userId, formId, submissionId)
}

function filesOf(answers: Array<{ valueJson: unknown }>): string[] {
  return answers.flatMap((answer) =>
    ((answer.valueJson as { files?: StoredFile[] } | null)?.files ?? []).map((file) => file.key),
  )
}

/**
 * Permanently deletes responses and their uploaded files. Responses that created a registration are
 * kept while the registration is active, because the attendee record depends on them.
 */
export async function deleteSubmissions(
  userId: string,
  formId: string,
  ids: string[],
): Promise<number> {
  await requireFormAccess(userId, formId)
  const rows = await prisma.formSubmission.findMany({
    where: { id: { in: ids }, formId },
    select: {
      id: true,
      registration: { select: { status: true } },
      answers: { select: { valueJson: true } },
    },
  })
  const blocked = rows.filter(
    (row) => row.registration && ['PENDING', 'CONFIRMED'].includes(row.registration.status),
  )
  if (blocked.length > 0) {
    throw conflict(
      'Cancel the registration before deleting a response that created it.',
      'HAS_ACTIVE_REGISTRATION',
    )
  }
  return removeSubmissions(formId, rows)
}

async function removeSubmissions(
  formId: string,
  rows: Array<{ id: string; answers: Array<{ valueJson: unknown }> }>,
) {
  if (rows.length === 0) return 0
  const deleted = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM forms WHERE id = ${formId}::uuid FOR UPDATE`
    const qualifying = await tx.formSubmission.count({
      where: { id: { in: rows.map((row) => row.id) }, qualification: 'QUALIFYING' },
    })
    const result = await tx.formSubmission.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    })
    // Deleting a qualifying response frees a place under the response limit.
    if (qualifying > 0) {
      await tx.$executeRaw`UPDATE forms SET qualifying_count = GREATEST(qualifying_count - ${qualifying}, 0) WHERE id = ${formId}::uuid`
    }
    return result.count
  })
  await deleteStoredFiles(rows.flatMap((row) => filesOf(row.answers)))
  return deleted
}

/** Deletes responses older than each form's retention period. Run by the scheduler. */
export async function applyRetention(now: Date = new Date()): Promise<number> {
  const forms = await prisma.form.findMany({
    where: { retentionDays: { not: null } },
    select: { id: true, retentionDays: true },
  })
  let total = 0
  for (const form of forms) {
    const cutoff = new Date(now.getTime() - (form.retentionDays as number) * 86_400_000)
    const rows = await prisma.formSubmission.findMany({
      where: {
        formId: form.id,
        submittedAt: { lt: cutoff },
        // Never remove the record behind an active registration.
        OR: [
          { registration: null },
          { registration: { status: { in: ['CANCELLED', 'DECLINED'] } } },
        ],
      },
      select: { id: true, answers: { select: { valueJson: true } } },
      take: 500,
    })
    total += await removeSubmissions(form.id, rows)
  }
  return total
}

export async function submissionStats(userId: string, formId: string) {
  const form = await requireFormAccess(userId, formId)
  const [groups, perDay, choiceAnswers, catalogue] = await Promise.all([
    prisma.formSubmission.groupBy({
      by: ['qualification', 'decision'],
      where: { formId },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ day: Date; total: bigint; qualifying: bigint }>>`
      SELECT date_trunc('day', submitted_at) AS day,
             count(*) AS total,
             count(*) FILTER (WHERE qualification = 'QUALIFYING') AS qualifying
        FROM form_submissions
       WHERE form_id = ${formId}::uuid
       GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ field_key: string; value: string; count: bigint }>>`
      SELECT a.field_key, s.value, count(*) AS count
        FROM submission_answers a
        JOIN form_submissions fs ON fs.id = a.submission_id
        CROSS JOIN LATERAL jsonb_array_elements_text(a.value_json -> 'selected') AS s(value)
       WHERE fs.form_id = ${formId}::uuid AND a.value_json ? 'selected'
       GROUP BY a.field_key, s.value`,
    fieldCatalogue(formId),
  ])
  const count = (predicate: (row: (typeof groups)[number]) => boolean) =>
    groups.filter(predicate).reduce((sum, row) => sum + row._count._all, 0)

  const choiceFields = catalogue.filter((field) => field.options.length > 0)
  return {
    received: count(() => true),
    qualifying: count((row) => row.qualification === 'QUALIFYING'),
    excluded: count((row) => row.qualification === 'EXCLUDED'),
    accepted: count((row) => row.qualification === 'QUALIFYING' && row.decision === 'ACCEPTED'),
    pending: count((row) => row.qualification === 'QUALIFYING' && row.decision === 'PENDING'),
    declined: count((row) => row.decision === 'DECLINED'),
    responseLimit: form.responseLimit,
    remaining:
      form.responseLimit === null ? null : Math.max(0, form.responseLimit - form.qualifyingCount),
    perDay: perDay.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      received: Number(row.total),
      qualifying: Number(row.qualifying),
    })),
    choices: choiceFields.map((field) => ({
      fieldKey: field.key,
      label: field.label,
      options: field.options.map((option) => ({
        value: option.value,
        label: option.label,
        count: Number(
          choiceAnswers.find((row) => row.field_key === field.key && row.value === option.value)
            ?.count ?? 0,
        ),
      })),
    })),
  }
}

/** CSV export of the filtered responses, one column per question across every version. */
export async function exportSubmissionsCsv(
  userId: string,
  formId: string,
  query: Omit<ListQuery, 'page' | 'pageSize'>,
) {
  const form = await requireFormAccess(userId, formId)
  const fields = await fieldCatalogue(formId)
  const rows = await prisma.formSubmission.findMany({
    where: whereFor(formId, query),
    orderBy: ORDER[query.sort],
    take: 50_000,
    include: submissionInclude,
  })
  const header = [
    'Response ID',
    'Submitted at (UTC)',
    'Name',
    'Email',
    'Guest',
    'Qualification',
    'Decision',
    'Exclusion reasons',
    'Form version',
    ...fields.map((field) => field.label),
  ]
  const data = rows.map((row) => {
    const answers = new Map(row.answers.map((answer) => [answer.fieldKey, answer]))
    const reasons =
      (row.exclusionReasons as Array<{ key: string; name: string | null }> | null) ?? []
    return [
      row.id,
      row.submittedAt,
      row.respondentName,
      row.respondentEmail,
      row.userId === null ? 'yes' : 'no',
      row.qualification,
      row.decision,
      reasons.map((reason) => reason.name ?? reason.key).join('; '),
      row.version.version,
      ...fields.map((field) => {
        const answer = answers.get(field.key)
        if (!answer) return ''
        return answer.valueText ?? answer.valueNumber ?? ''
      }),
    ]
  })
  return { csv: toCsv(header, data), filename: `${form.slug}-responses.csv`, count: rows.length }
}

/** Streams one uploaded file to an authorised organiser. */
export async function downloadSubmissionFile(
  userId: string,
  formId: string,
  submissionId: string,
  fileId: string,
) {
  await requireFormAccess(userId, formId)
  const answers = await prisma.submissionAnswer.findMany({
    where: { submissionId, submission: { formId }, field: { type: 'FILE' } },
    select: { valueJson: true },
  })
  const file = answers
    .flatMap((answer) => (answer.valueJson as { files?: StoredFile[] } | null)?.files ?? [])
    .find((candidate) => candidate.id === fileId)
  if (!file) throw notFound('File')
  const stored = await storage.get(file.key)
  if (!stored) throw notFound('File')
  return { ...stored, name: file.name, mimeType: file.mimeType }
}
