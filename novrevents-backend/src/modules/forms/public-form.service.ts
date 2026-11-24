import { randomUUID } from 'node:crypto'
import { clientKey, sha256 } from '../../lib/crypto.js'
import { isUniqueViolation, LOCKING_TX, Prisma, prisma, type Tx } from '../../lib/db.js'
import {
  AppError,
  badRequest,
  notFound,
  payloadTooLarge,
  validationError,
} from '../../lib/errors.js'
import { deleteStoredFiles, publicFileUrl } from '../../lib/storage/index.js'
import { sanitizeFilename, storePrivateDocument, validateDocument } from '../../lib/uploads.js'
import type { Form, FormSubmission } from '../../generated/prisma/client.js'
import { queueEmail } from '../communications/outbox.js'
import { submissionReceiptContent } from '../communications/templates.js'
import { eventCardInclude, registrationState } from '../events/event.dto.js'
import {
  chooseTicketType,
  createRegistration,
  eventFull,
  lockEvent,
  lockTicketType,
  ticketTypeFull,
} from '../registrations/registration.service.js'
import { manageUrlFor } from '../tickets/ticket-credential.js'
import {
  LIMITS,
  matchingExclusions,
  validateAnswers,
  type AnswerValue,
  type Answers,
  type FieldDef,
  type FileRef,
} from './engine/index.js'
import { loadVersion, type LoadedVersion } from './form-store.js'
import { formAvailability } from './form.service.js'

const MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024

const formInclude = {
  owner: { select: { status: true } },
  event: {
    include: {
      ...eventCardInclude,
      ticketTypes: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
    },
  },
} satisfies Prisma.FormInclude

type PublicFormRow = Prisma.FormGetPayload<{ include: typeof formInclude }>

type ClosedReason =
  | 'NOT_PUBLISHED'
  | 'CLOSED'
  | 'FULL'
  | 'EVENT_FULL'
  | 'EVENT_CANCELLED'
  | 'EVENT_ENDED'
  | 'DEADLINE_PASSED'
  | 'NO_FORM'
  | 'FORM_CLOSED'

const CLOSED_MESSAGES: Record<ClosedReason, string> = {
  NOT_PUBLISHED: 'This form is not currently available.',
  NO_FORM: 'This form is not currently available.',
  CLOSED: 'This form is no longer accepting responses.',
  FORM_CLOSED: 'This form is no longer accepting responses.',
  FULL: 'This form has reached its response limit.',
  EVENT_FULL: 'This event has reached its capacity.',
  EVENT_CANCELLED: 'This event has been cancelled.',
  EVENT_ENDED: 'This event has ended.',
  DEADLINE_PASSED: 'The registration deadline has passed.',
}

const closedError = (reason: ClosedReason) =>
  new AppError(
    409,
    reason === 'FULL' ? 'FORM_FULL' : reason === 'EVENT_FULL' ? 'EVENT_FULL' : `FORM_${reason}`,
    CLOSED_MESSAGES[reason],
  )

const isRegistrationForm = (form: PublicFormRow) => form.event?.registrationFormId === form.id

/** Combines the form's own rules with its event's state into one answer: can someone respond now? */
function availability(
  form: PublicFormRow,
  now: Date,
): { open: boolean; reason: 'OPEN' | ClosedReason } {
  const own = formAvailability(form, now)
  if (!own.open) return own as { open: false; reason: ClosedReason }
  if (form.event) {
    if (isRegistrationForm(form)) {
      const state = registrationState(form.event, now)
      // The form's own limit was checked above, so FULL here means the event's capacity.
      if (!state.open)
        return {
          open: false,
          reason: state.reason === 'FULL' ? 'EVENT_FULL' : (state.reason as ClosedReason),
        }
    } else if (form.event.status === 'CANCELLED') {
      return { open: false, reason: 'EVENT_CANCELLED' }
    }
  }
  return { open: true, reason: 'OPEN' }
}

async function findPublicForm(slug: string): Promise<PublicFormRow> {
  const form = await prisma.form.findUnique({ where: { slug }, include: formInclude })
  // A form that was never published has no public address yet.
  if (!form || form.status === 'DRAFT' || form.owner.status !== 'ACTIVE') throw notFound('Form')
  if (
    form.event &&
    (form.event.moderationStatus === 'REMOVED' || form.event.owner.status !== 'ACTIVE')
  ) {
    throw notFound('Form')
  }
  return form
}

// ─── Rendering ───────────────────────────────────────────────────────────────

export async function getPublicForm(slug: string, viewerId: string | null) {
  const now = new Date()
  const form = await findPublicForm(slug)
  const state = availability(form, now)
  const version =
    form.status === 'PUBLISHED' && form.publishedVersionId
      ? await loadVersion(prisma, form.publishedVersionId)
      : null
  const viewer = viewerId
    ? await prisma.user.findUnique({
        where: { id: viewerId },
        select: { email: true, profile: { select: { displayName: true } } },
      })
    : null
  const event = form.event
  const registration = isRegistrationForm(form)

  return {
    slug: form.slug,
    title: form.title,
    description: form.description,
    purpose: form.purpose,
    open: state.open,
    reason: state.reason,
    closesAt: form.closesAt,
    versionId: version?.id ?? null,
    definition: version
      ? {
          steps: version.definition.steps.map((step) => ({
            ...step,
            description: step.description ?? null,
          })),
          fields: version.definition.fields.map((field) => ({
            ...field,
            description: field.description ?? null,
            placeholder: field.placeholder ?? null,
            role: field.role ?? null,
          })),
          // Exclusion rules stay on the server. Respondents only receive what is needed to render.
          rules: version.definition.rules
            .filter((rule) => rule.enabled && rule.type !== 'EXCLUDE')
            .map((rule) => ({ ...rule, name: null })),
        }
      : null,
    isRegistrationForm: registration,
    requiresApproval: registration && !form.autoAccept,
    ticketTypes:
      registration && event
        ? event.ticketTypes.map((type) => ({
            id: type.id,
            name: type.name,
            description: type.description,
            available: type.capacity === null || type.registeredCount < type.capacity,
          }))
        : [],
    event:
      event && event.status !== 'DRAFT' && event.status !== 'ARCHIVED'
        ? {
            slug: event.slug,
            title: event.title,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            timezone: event.timezone,
            mode: event.mode,
            venueName: event.venueName,
            city: event.city,
            country: event.country,
            organizerName: event.organizerName,
          }
        : null,
    branding: {
      accentColor: event?.accentColor ?? null,
      logoUrl: publicFileUrl(event?.logoKey),
      bannerUrl: publicFileUrl(event?.bannerKey),
    },
    prefill: { name: viewer?.profile?.displayName ?? null, email: viewer?.email ?? null },
  }
}

/** Funnel beacons: the form was viewed, or the respondent started filling it in. */
export async function recordFormEvent(
  slug: string,
  type: 'view' | 'start',
  sessionKey: string,
  visitor: { ip: string; userAgent: string },
): Promise<void> {
  const form = await findPublicForm(slug)
  if (form.status !== 'PUBLISHED') return
  await prisma.analyticsEvent.createMany({
    data: [
      {
        type: type === 'view' ? 'FORM_VIEW' : 'FORM_START',
        formId: form.id,
        eventId: form.eventId,
        sessionKey,
        visitorKey: clientKey(
          `${visitor.ip}|${visitor.userAgent}`,
          new Date().toISOString().slice(0, 10),
        ),
      },
    ],
    skipDuplicates: true,
  })
}

// ─── Submission ──────────────────────────────────────────────────────────────

export interface UploadedFormFile {
  fieldKey: string
  filename: string
  buffer: Buffer
}

export interface SubmitInput {
  answers: Record<string, unknown>
  idempotencyKey: string
  versionId?: string
  ticketTypeId?: string
  files: UploadedFormFile[]
}

export interface SubmitContext {
  userId: string | null
  ip: string
  userAgent: string
}

interface StoredFile {
  id: string
  key: string
  name: string
  size: number
  mimeType: string
}

const NEUTRAL = 'Thank you. Your response has been received.'

type SubmissionWithRegistration = FormSubmission & {
  registration: { id: string; status: string; accessVersion: number } | null
}

/**
 * What the respondent is told. An accepted response gets the organiser's confirmation message; a
 * response that is excluded or still awaiting a decision gets a neutral acknowledgement that
 * confirms receipt and promises nothing more.
 */
function resultFor(
  form: Pick<Form, 'confirmationMessage'>,
  submission: SubmissionWithRegistration,
  registrationForm: boolean,
) {
  const registration = submission.registration
  if (registration && (registration.status === 'CONFIRMED' || registration.status === 'PENDING')) {
    const confirmed = registration.status === 'CONFIRMED'
    return {
      status: 'RECEIVED' as const,
      message: confirmed
        ? (form.confirmationMessage ?? 'You are registered. Your ticket has been emailed to you.')
        : 'Your registration has been received and is awaiting review by the organiser.',
      registration: {
        status: confirmed ? ('CONFIRMED' as const) : ('PENDING' as const),
        manageUrl: manageUrlFor({ id: registration.id, accessVersion: registration.accessVersion }),
      },
    }
  }
  const accepted = submission.qualification === 'QUALIFYING' && submission.decision === 'ACCEPTED'
  return {
    status: 'RECEIVED' as const,
    message:
      accepted && !registrationForm
        ? (form.confirmationMessage ?? NEUTRAL)
        : registrationForm
          ? `${NEUTRAL} If your registration is confirmed, you will receive an email with your ticket.`
          : NEUTRAL,
    registration: null,
  }
}

const findByIdempotencyKey = (formId: string, idempotencyKey: string) =>
  prisma.formSubmission.findUnique({
    where: { formId_idempotencyKey: { formId, idempotencyKey } },
    include: { registration: { select: { id: true, status: true, accessVersion: true } } },
  })

function duplicateHashFor(
  form: Pick<Form, 'id' | 'duplicateFieldKeys'>,
  values: Record<string, AnswerValue>,
): string | null {
  if (form.duplicateFieldKeys.length === 0) return null
  const parts = form.duplicateFieldKeys.map((key) => {
    const value = values[key]
    if (value === null || value === undefined) return ''
    if (Array.isArray(value))
      return value
        .map((item) => (typeof item === 'string' ? item : item.name))
        .sort()
        .join('|')
    return String(value).trim().toLowerCase().replace(/\s+/g, ' ')
  })
  // Nothing to compare (all the configured questions were left empty): not a duplicate candidate.
  if (parts.every((part) => part === '')) return null
  return sha256(`${form.id}:${JSON.stringify(parts)}`)
}

function answerRow(
  field: FieldDef,
  fieldId: string,
  value: Exclude<AnswerValue, null | undefined>,
  files: StoredFile[],
) {
  const base = {
    fieldId,
    fieldKey: field.key,
    valueText: null as string | null,
    valueNumber: null as number | null,
  }
  const labelOf = (optionValue: string) =>
    field.options?.find((option) => option.value === optionValue)?.label ?? optionValue

  switch (field.type) {
    case 'NUMBER':
      return {
        ...base,
        valueText: String(value),
        valueNumber: value as number,
        valueJson: Prisma.JsonNull,
      }
    case 'DROPDOWN':
    case 'RADIO':
      return {
        ...base,
        valueText: labelOf(value as string),
        valueJson: { selected: [value as string] },
      }
    case 'CHECKBOX':
    case 'MULTI_SELECT':
      return {
        ...base,
        valueText: (value as string[]).map(labelOf).join(', '),
        valueJson: { selected: value as string[] },
      }
    case 'FILE':
      return {
        ...base,
        valueText: files.map((file) => file.name).join(', '),
        valueJson: { files } as unknown as Prisma.InputJsonValue,
      }
    default:
      return { ...base, valueText: value as string, valueJson: Prisma.JsonNull }
  }
}

/** Validates the content of every uploaded file and stores it privately. */
async function storeUploads(
  form: Pick<Form, 'id'>,
  version: LoadedVersion,
  values: Record<string, AnswerValue>,
  uploads: UploadedFormFile[],
): Promise<Map<string, StoredFile[]>> {
  const stored = new Map<string, StoredFile[]>()
  try {
    for (const field of version.definition.fields) {
      // Only files for questions the respondent could actually see are kept.
      if (field.type !== 'FILE' || !(field.key in values)) continue
      const rules = field.validation ?? {}
      const maxBytes =
        Math.min(rules.maxFileSizeMb ?? LIMITS.maxFileSizeMb, LIMITS.maxFileSizeMb) * 1024 * 1024
      const files: StoredFile[] = []
      for (const upload of uploads.filter((candidate) => candidate.fieldKey === field.key)) {
        const document = await validateDocument(upload.buffer, upload.filename, {
          maxBytes,
          allowedExtensions: rules.allowedExtensions,
        })
        const key = await storePrivateDocument(`forms/${form.id}`, upload.buffer, document)
        files.push({
          id: randomUUID(),
          key,
          name: document.safeName,
          size: upload.buffer.length,
          mimeType: document.mimeType,
        })
      }
      stored.set(field.key, files)
    }
  } catch (error) {
    await deleteStoredFiles([...stored.values()].flat().map((file) => file.key))
    throw error
  }
  return stored
}

/**
 * Accepts one response to a public form. Works for guests and signed-in users alike.
 *
 * The decisions that depend on shared state — the response limit, the event capacity and the
 * ticket type capacity — are made inside one transaction that holds a row lock on the form (and
 * on the event for registrations). Simultaneous submissions queue on that lock, so the limit can
 * never be exceeded. Duplicate detection is backed by a unique index for the same reason.
 */
export async function submitForm(slug: string, input: SubmitInput, context: SubmitContext) {
  const now = new Date()
  const form = await findPublicForm(slug)
  const registrationForm = isRegistrationForm(form)

  // A retried request returns the original outcome and never creates a second response.
  const replay = await findByIdempotencyKey(form.id, input.idempotencyKey)
  if (replay) return resultFor(form, replay, registrationForm)

  const state = availability(form, now)
  if (!state.open) throw closedError(state.reason as ClosedReason)
  if (!form.publishedVersionId) throw closedError('NOT_PUBLISHED')
  if (input.versionId && input.versionId !== form.publishedVersionId) {
    throw new AppError(
      409,
      'FORM_UPDATED',
      'This form was updated while you were filling it in. Reload the page and try again.',
    )
  }
  const version = await loadVersion(prisma, form.publishedVersionId)

  // ── Validate ──
  const totalBytes = input.files.reduce((sum, file) => sum + file.buffer.length, 0)
  if (totalBytes > MAX_TOTAL_UPLOAD_BYTES)
    throw payloadTooLarge('The attached files are too large in total.')
  const answers: Answers = { ...(input.answers as Answers) }
  const fileFields = new Set(
    version.definition.fields.filter((field) => field.type === 'FILE').map((field) => field.key),
  )
  for (const key of fileFields) delete answers[key]
  for (const upload of input.files) {
    if (!fileFields.has(upload.fieldKey))
      throw badRequest('A file was attached to a question that does not accept files.')
    const list = (answers[upload.fieldKey] as FileRef[] | undefined) ?? []
    list.push({ name: sanitizeFilename(upload.filename), size: upload.buffer.length })
    answers[upload.fieldKey] = list
  }

  const { values, errors } = validateAnswers(version.definition, answers)
  if (errors.length > 0) {
    throw validationError(
      errors.map((error) => ({ path: `answers.${error.fieldKey}`, message: error.message })),
    )
  }

  // ── Evaluate rules ──
  const excludedBy = matchingExclusions(version.definition, values)
  const qualifying = excludedBy.length === 0
  const roleValue = (role: 'RESPONDENT_NAME' | 'RESPONDENT_EMAIL') => {
    const field = version.definition.fields.find((candidate) => candidate.role === role)
    const value = field ? values[field.key] : undefined
    return typeof value === 'string' && value ? value : null
  }
  const respondentName = roleValue('RESPONDENT_NAME')
  const respondentEmail = roleValue('RESPONDENT_EMAIL')
  const duplicateHash = duplicateHashFor(form, values)

  const stored = await storeUploads(form, version, values, input.files)
  const storedKeys = [...stored.values()].flat().map((file) => file.key)

  try {
    const submission = await prisma.$transaction(async (tx) => {
      // Serialise every submission to this form.
      await tx.$queryRaw`SELECT id FROM forms WHERE id = ${form.id}::uuid FOR UPDATE`
      const locked = await tx.form.findUniqueOrThrow({ where: { id: form.id } })
      const current = formAvailability(locked, new Date())
      if (!current.open) throw closedError(current.reason as ClosedReason)

      const created = await tx.formSubmission.create({
        data: {
          formId: form.id,
          formVersionId: version.id,
          userId: context.userId,
          respondentName,
          respondentEmail,
          qualification: qualifying ? 'QUALIFYING' : 'EXCLUDED',
          decision: qualifying && form.autoAccept ? 'ACCEPTED' : 'PENDING',
          exclusionReasons: qualifying
            ? Prisma.JsonNull
            : excludedBy.map((rule) => ({ key: rule.key, name: rule.name ?? null })),
          idempotencyKey: input.idempotencyKey,
          duplicateHash,
          clientKey: clientKey(context.ip),
          submittedAt: now,
          decidedAt: qualifying && form.autoAccept ? now : null,
          answers: {
            create: version.definition.fields.flatMap((field) => {
              const value = values[field.key]
              const row = version.fieldRows.get(field.key)
              if (value === undefined || value === null || !row) return []
              return [answerRow(field, row.id, value, stored.get(field.key) ?? [])]
            }),
          },
        },
      })

      if (qualifying) {
        await tx.form.update({
          where: { id: form.id },
          data: { qualifyingCount: { increment: 1 } },
        })
      }

      const registration =
        qualifying && registrationForm && form.event
          ? await registerAttendee(tx, {
              eventId: form.event.id,
              submissionId: created.id,
              userId: context.userId,
              name: respondentName,
              email: respondentEmail,
              ticketTypeId: input.ticketTypeId,
              confirmed: form.autoAccept,
            })
          : null

      // Registrations send their own confirmation; everything else gets the neutral receipt.
      if (!registration && form.sendConfirmationEmail && respondentEmail) {
        await queueEmail(tx, {
          type: 'SUBMISSION_RECEIPT',
          to: { email: respondentEmail, name: respondentName },
          userId: context.userId,
          eventId: form.eventId,
          content: () =>
            submissionReceiptContent({
              formTitle: form.title,
              name: respondentName,
              accent: form.event?.accentColor,
            }),
        })
      }

      const visitorKey = clientKey(
        `${context.ip}|${context.userAgent}`,
        now.toISOString().slice(0, 10),
      )
      await tx.analyticsEvent.createMany({
        data: (['FORM_START', 'FORM_SUBMIT'] as const).map((type) => ({
          type,
          formId: form.id,
          eventId: form.eventId,
          sessionKey: input.idempotencyKey,
          visitorKey,
        })),
        // A completed response implies a start even if the start beacon never arrived.
        skipDuplicates: true,
      })

      return {
        ...created,
        registration: registration
          ? {
              id: registration.id,
              status: registration.status,
              accessVersion: registration.accessVersion,
            }
          : null,
      }
    }, LOCKING_TX)

    return resultFor(form, submission, registrationForm)
  } catch (error) {
    await deleteStoredFiles(storedKeys)
    if (isUniqueViolation(error, 'idempotency_key')) {
      const existing = await findByIdempotencyKey(form.id, input.idempotencyKey)
      if (existing) return resultFor(form, existing, registrationForm)
    }
    if (isUniqueViolation(error, 'duplicate_hash')) {
      throw new AppError(
        409,
        'DUPLICATE_SUBMISSION',
        'A response with these details has already been submitted.',
      )
    }
    throw error
  }
}

/** Turns a qualifying registration-form response into a registration, under the capacity locks. */
async function registerAttendee(
  tx: Tx,
  input: {
    eventId: string
    submissionId: string
    userId: string | null
    name: string | null
    email: string | null
    ticketTypeId: string | undefined
    confirmed: boolean
  },
) {
  if (!input.name || !input.email) {
    // Publishing validation guarantees both questions exist; this guards against data drift.
    throw badRequest(
      'A name and an email address are required to register.',
      'MISSING_ATTENDEE_DETAILS',
    )
  }
  const event = await lockEvent(tx, input.eventId)
  if (event.status === 'CANCELLED') throw closedError('EVENT_CANCELLED')
  if (event.endsAt <= new Date()) throw closedError('EVENT_ENDED')
  if (event.registrationDeadline && event.registrationDeadline <= new Date())
    throw closedError('DEADLINE_PASSED')
  if (event.capacity !== null && event.registeredCount >= event.capacity) throw eventFull()

  const chosen = await chooseTicketType(tx, event.id, input.ticketTypeId)
  const ticketType = await lockTicketType(tx, chosen.id)
  if (ticketType.capacity !== null && ticketType.registeredCount >= ticketType.capacity)
    throw ticketTypeFull()

  const { registration } = await createRegistration(tx, {
    event,
    ticketType,
    submissionId: input.submissionId,
    userId: input.userId,
    attendeeName: input.name,
    attendeeEmail: input.email,
    confirmed: input.confirmed,
  })
  return registration
}
