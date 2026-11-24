import type { z } from 'zod'
import { appUrl } from '../../config/env.js'
import { isUniqueViolation, prisma, type Prisma } from '../../lib/db.js'
import { AppError, badRequest, conflict, forbidden, unprocessable } from '../../lib/errors.js'
import { slugWithSuffix } from '../../lib/slug.js'
import { deleteStoredFiles } from '../../lib/storage/index.js'
import type { Form, FormPurpose } from '../../generated/prisma/client.js'
import { requireEventAccess } from '../events/event-access.js'
import { requireOrgRole } from '../organizations/org-access.js'
import { validateDefinition, type FormDefinition } from './engine/index.js'
import { formsAccessibleBy, requireFormAccess } from './form-access.js'
import { createDraftVersion, findDraftVersion, loadVersion, writeDefinition } from './form-store.js'
import { defaultSettingsFor, templateFor } from './form-templates.js'
import type { createFormBody, formListQuery, updateFormBody } from './form.schemas.js'

type CreateInput = z.infer<typeof createFormBody>
type UpdateInput = z.infer<typeof updateFormBody>
type ListQuery = z.infer<typeof formListQuery>

export const formUrl = (slug: string) => `${appUrl}/f/${slug}`

/** Whether a form would accept a response right now, looking only at the form's own rules. */
export function formAvailability(
  form: Pick<Form, 'status' | 'closesAt' | 'responseLimit' | 'qualifyingCount'>,
  now: Date = new Date(),
): { open: boolean; reason: 'OPEN' | 'NOT_PUBLISHED' | 'CLOSED' | 'FULL' } {
  if (form.status !== 'PUBLISHED') return { open: false, reason: 'NOT_PUBLISHED' }
  if (form.closesAt && form.closesAt <= now) return { open: false, reason: 'CLOSED' }
  if (form.responseLimit !== null && form.qualifyingCount >= form.responseLimit)
    return { open: false, reason: 'FULL' }
  return { open: true, reason: 'OPEN' }
}

const summaryInclude = {
  event: { select: { id: true, slug: true, title: true, registrationFormId: true } },
} satisfies Prisma.FormInclude

type FormWithEvent = Prisma.FormGetPayload<{ include: typeof summaryInclude }>

async function submissionCounts(formIds: string[]) {
  const rows = await prisma.formSubmission.groupBy({
    by: ['formId', 'qualification'],
    where: { formId: { in: formIds } },
    _count: { _all: true },
  })
  const counts = new Map<string, { received: number; qualifying: number; excluded: number }>()
  for (const id of formIds) counts.set(id, { received: 0, qualifying: 0, excluded: 0 })
  for (const row of rows) {
    const entry = counts.get(row.formId)
    if (!entry) continue
    entry.received += row._count._all
    if (row.qualification === 'QUALIFYING') entry.qualifying += row._count._all
    else entry.excluded += row._count._all
  }
  return counts
}

function toSummary(
  form: FormWithEvent,
  counts: { received: number; qualifying: number; excluded: number },
) {
  return {
    id: form.id,
    slug: form.slug,
    title: form.title,
    description: form.description,
    purpose: form.purpose,
    status: form.status,
    eventId: form.eventId,
    event: form.event
      ? { id: form.event.id, slug: form.event.slug, title: form.event.title }
      : null,
    organizationId: form.organizationId,
    isRegistrationForm: form.event?.registrationFormId === form.id,
    closesAt: form.closesAt,
    responseLimit: form.responseLimit,
    availability: formAvailability(form),
    counts,
    publicUrl: formUrl(form.slug),
    publishedAt: form.publishedAt,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  }
}

async function toDetail(formId: string) {
  const form = await prisma.form.findUniqueOrThrow({
    where: { id: formId },
    include: { ...summaryInclude, publishedVersion: { select: { id: true, version: true } } },
  })
  const draft = await findDraftVersion(prisma, formId)
  const editable = draft ?? form.publishedVersion
  const definition: FormDefinition = editable
    ? (await loadVersion(prisma, editable.id)).definition
    : { steps: [{ key: 'details', title: 'Details', description: null }], fields: [], rules: [] }
  const counts = (await submissionCounts([formId])).get(formId) ?? {
    received: 0,
    qualifying: 0,
    excluded: 0,
  }

  return {
    ...toSummary(form, counts),
    duplicateFieldKeys: form.duplicateFieldKeys,
    autoAccept: form.autoAccept,
    confirmationMessage: form.confirmationMessage,
    sendConfirmationEmail: form.sendConfirmationEmail,
    retentionDays: form.retentionDays,
    publishedVersion: form.publishedVersion?.version ?? null,
    draftVersion: draft?.version ?? null,
    hasUnpublishedChanges: draft !== null && form.publishedVersion !== null,
    definition: {
      steps: definition.steps.map((step) => ({ ...step, description: step.description ?? null })),
      fields: definition.fields.map((field) => ({
        ...field,
        description: field.description ?? null,
        placeholder: field.placeholder ?? null,
        role: field.role ?? null,
      })),
      rules: definition.rules.map((rule) => ({ ...rule, name: rule.name ?? null })),
    },
  }
}

// ─── Create / read ───────────────────────────────────────────────────────────

export async function createForm(userId: string, input: CreateInput) {
  let organizationId = input.organizationId ?? null
  if (input.eventId) {
    const { event } = await requireEventAccess(userId, input.eventId, 'manage')
    organizationId = event.organizationId
    if (input.purpose === 'REGISTRATION' && event.registrationFormId) {
      throw conflict('This event already has a registration form.', 'REGISTRATION_FORM_EXISTS')
    }
  } else {
    if (input.purpose === 'REGISTRATION') {
      throw badRequest('A registration form must be attached to an event.', 'EVENT_REQUIRED')
    }
    if (organizationId) await requireOrgRole(userId, organizationId, 'MEMBER')
  }

  const defaults = defaultSettingsFor(input.purpose)
  const definition = templateFor(input.purpose)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const formId = await prisma.$transaction(async (tx) => {
        const form = await tx.form.create({
          data: {
            slug: slugWithSuffix(input.title, 40),
            ownerId: userId,
            organizationId,
            eventId: input.eventId ?? null,
            purpose: input.purpose,
            title: input.title,
            description: input.description ?? null,
            autoAccept: defaults.autoAccept,
            duplicateFieldKeys: defaults.duplicateFieldKeys,
          },
          select: { id: true },
        })
        await createDraftVersion(tx, form.id, definition, userId)
        if (input.purpose === 'REGISTRATION' && input.eventId) {
          await tx.event.update({
            where: { id: input.eventId },
            data: { registrationFormId: form.id },
          })
        }
        return form.id
      })
      return toDetail(formId)
    } catch (error) {
      if (!isUniqueViolation(error, 'slug')) throw error
    }
  }
  throw conflict('Could not generate a unique address for this form. Try again.')
}

export async function getForm(userId: string, formId: string) {
  await requireFormAccess(userId, formId)
  return toDetail(formId)
}

export async function listForms(userId: string, query: ListQuery) {
  const where: Prisma.FormWhereInput = {
    AND: [
      formsAccessibleBy(userId),
      query.eventId ? { eventId: query.eventId } : {},
      query.scope === 'standalone' ? { eventId: null } : {},
      query.purpose ? { purpose: query.purpose } : {},
      query.status ? { status: query.status } : {},
      query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {},
    ],
  }
  const [forms, total] = await Promise.all([
    prisma.form.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: summaryInclude,
    }),
    prisma.form.count({ where }),
  ])
  const counts = await submissionCounts(forms.map((form) => form.id))
  return {
    items: forms.map((form) =>
      toSummary(form, counts.get(form.id) ?? { received: 0, qualifying: 0, excluded: 0 }),
    ),
    total,
  }
}

export async function listVersions(userId: string, formId: string) {
  const form = await requireFormAccess(userId, formId)
  const versions = await prisma.formVersion.findMany({
    where: { formId },
    orderBy: { version: 'desc' },
    include: { _count: { select: { fields: true, submissions: true } } },
  })
  return versions.map((version) => ({
    id: version.id,
    version: version.version,
    publishedAt: version.publishedAt,
    isLive: form.publishedVersionId === version.id && form.status === 'PUBLISHED',
    fieldCount: version._count.fields,
    submissionCount: version._count.submissions,
    createdAt: version.createdAt,
  }))
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function updateFormSettings(userId: string, formId: string, patch: UpdateInput) {
  const form = await requireFormAccess(userId, formId)
  if (patch.responseLimit != null && patch.responseLimit < form.qualifyingCount) {
    throw badRequest(
      `The limit cannot be lower than the ${form.qualifyingCount} qualifying responses already received.`,
      'LIMIT_BELOW_RECEIVED',
    )
  }
  if (patch.duplicateFieldKeys) {
    // The duplicate rule must point at questions that exist in the version respondents see.
    const versionId = form.publishedVersionId ?? (await findDraftVersion(prisma, formId))?.id
    if (versionId) {
      const { definition } = await loadVersion(prisma, versionId)
      const issues = validateDefinition(definition, {
        mode: 'draft',
        duplicateFieldKeys: patch.duplicateFieldKeys,
      }).filter((issue) => issue.path === 'duplicateFieldKeys')
      if (issues.length > 0)
        throw badRequest(issues[0]?.message ?? 'Invalid duplicate rule.', 'INVALID_DUPLICATE_RULE')
    }
  }
  await prisma.form.update({ where: { id: formId }, data: patch })
  return toDetail(formId)
}

// ─── Draft and publishing ────────────────────────────────────────────────────

function definitionError(
  issues: Array<{ path: string; message: string }>,
  message: string,
  code: string,
  status = 400,
) {
  return new AppError(
    status,
    code,
    message,
    issues.map((issue) => ({ path: `definition.${issue.path}`, message: issue.message })),
  )
}

/**
 * Saves the builder's working copy. Published versions are immutable, so the first save after a
 * publish creates a new draft version; later saves overwrite that draft.
 */
export async function saveDraft(userId: string, formId: string, definition: FormDefinition) {
  await requireFormAccess(userId, formId)
  const issues = validateDefinition(definition, { mode: 'draft' })
  if (issues.length > 0)
    throw definitionError(
      issues,
      'The form has problems that must be fixed before saving.',
      'INVALID_DEFINITION',
    )

  await prisma.$transaction(async (tx) => {
    const draft = await findDraftVersion(tx, formId)
    if (draft) await writeDefinition(tx, draft.id, definition)
    else await createDraftVersion(tx, formId, definition, userId)
    await tx.form.update({ where: { id: formId }, data: { updatedAt: new Date() } })
  })
  return toDetail(formId)
}

/**
 * Makes the draft live. The draft becomes an immutable version; responses record the version they
 * answered, so earlier responses keep their original questions.
 */
export async function publishForm(userId: string, formId: string) {
  const form = await requireFormAccess(userId, formId)
  const draft = await findDraftVersion(prisma, formId)

  if (!draft) {
    // No pending changes: this re-opens a form that was unpublished.
    if (!form.publishedVersionId)
      throw conflict('This form has nothing to publish yet.', 'NOTHING_TO_PUBLISH')
    await prisma.form.update({ where: { id: formId }, data: { status: 'PUBLISHED' } })
    return toDetail(formId)
  }

  const { definition } = await loadVersion(prisma, draft.id)
  const event = form.eventId
    ? await prisma.event.findUnique({
        where: { id: form.eventId },
        select: { registrationFormId: true },
      })
    : null
  const issues = validateDefinition(definition, {
    mode: 'publish',
    requireRespondentFields: event?.registrationFormId === formId,
    duplicateFieldKeys: form.duplicateFieldKeys,
  })
  if (issues.length > 0) {
    throw definitionError(
      issues,
      'Fix these problems before publishing the form.',
      'FORM_INCOMPLETE',
      422,
    )
  }

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.formVersion.update({ where: { id: draft.id }, data: { publishedAt: now } })
    await tx.form.update({
      where: { id: formId },
      data: {
        status: 'PUBLISHED',
        publishedVersionId: draft.id,
        publishedAt: form.publishedAt ?? now,
      },
    })
  })
  return toDetail(formId)
}

/** Takes the form offline. Its public address keeps working and explains that it is unavailable. */
export async function unpublishForm(userId: string, formId: string) {
  const form = await requireFormAccess(userId, formId)
  if (form.status !== 'PUBLISHED') throw conflict('This form is not published.', 'INVALID_STATUS')
  await prisma.form.update({ where: { id: formId }, data: { status: 'UNPUBLISHED' } })
  return toDetail(formId)
}

/** Copies the questions, rules and settings into a new draft form. Responses are not copied. */
export async function duplicateForm(userId: string, formId: string) {
  const form = await requireFormAccess(userId, formId)
  const sourceVersion = (await findDraftVersion(prisma, formId))?.id ?? form.publishedVersionId
  if (!sourceVersion) throw unprocessable('This form has no questions to copy.', 'NOTHING_TO_COPY')
  const { definition } = await loadVersion(prisma, sourceVersion)

  // An event can have one registration form, so a copy of it becomes a general-purpose form.
  const purpose: FormPurpose = form.purpose === 'REGISTRATION' ? 'GENERAL' : form.purpose
  const title = `${form.title} (copy)`.slice(0, 160)

  const copyId = await prisma.$transaction(async (tx) => {
    const copy = await tx.form.create({
      data: {
        slug: slugWithSuffix(title, 40),
        ownerId: userId,
        organizationId: form.organizationId,
        eventId: form.eventId,
        purpose,
        title,
        description: form.description,
        closesAt: form.closesAt,
        responseLimit: form.responseLimit,
        duplicateFieldKeys: form.duplicateFieldKeys,
        autoAccept: form.autoAccept,
        confirmationMessage: form.confirmationMessage,
        sendConfirmationEmail: form.sendConfirmationEmail,
        retentionDays: form.retentionDays,
      },
      select: { id: true },
    })
    await createDraftVersion(tx, copy.id, definition, userId)
    return copy.id
  })
  return toDetail(copyId)
}

/**
 * Deletes a form with all of its versions and responses. A registration form that has produced
 * registrations cannot be deleted, because those attendee records depend on it.
 */
export async function deleteForm(
  userId: string,
  formId: string,
): Promise<{ deletedResponses: number }> {
  const form = await requireFormAccess(userId, formId)
  if (form.ownerId !== userId && form.eventId) {
    // Managers can run a form; removing it together with its responses is reserved for owners.
    await requireEventAccess(userId, form.eventId, 'admin').catch(() => {
      throw forbidden('Only the form owner or the event owner can delete this form.')
    })
  }
  const registrations = await prisma.registration.count({ where: { submission: { formId } } })
  if (registrations > 0) {
    throw conflict(
      'This form has registrations. Unpublish it instead of deleting it.',
      'HAS_REGISTRATIONS',
    )
  }
  const files = await prisma.submissionAnswer.findMany({
    where: { submission: { formId }, field: { type: 'FILE' } },
    select: { valueJson: true },
  })
  const deletedResponses = await prisma.formSubmission.count({ where: { formId } })

  await prisma.$transaction(async (tx) => {
    // Answers reference fields, and the form references its published version, so unwind in order.
    await tx.formSubmission.deleteMany({ where: { formId } })
    await tx.form.update({ where: { id: formId }, data: { publishedVersionId: null } })
    await tx.form.delete({ where: { id: formId } })
  })
  await deleteStoredFiles(
    files.flatMap((answer) =>
      ((answer.valueJson as { files?: Array<{ key: string }> } | null)?.files ?? []).map(
        (file) => file.key,
      ),
    ),
  )
  return { deletedResponses }
}
