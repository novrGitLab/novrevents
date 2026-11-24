import { z } from 'zod'
import { isoDateTime, optionalText, paginationQuery, requiredText } from '../../lib/http.js'
import { FIELD_TYPES, FILE_EXTENSIONS, LIMITS, OPERATORS, RULE_TYPES } from './engine/index.js'

export const FORM_PURPOSES = [
  'REGISTRATION',
  'VOLUNTEER',
  'SPEAKER',
  'JUDGE',
  'SPONSORSHIP',
  'WORKSHOP',
  'FEEDBACK',
  'GENERAL',
] as const
export const formPurposeSchema = z.enum(FORM_PURPOSES)
export const formStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'UNPUBLISHED'])

const keySchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Invalid key.')

// ─── Definition (input) ──────────────────────────────────────────────────────
// Shape and size limits are enforced here; cross-references are checked by the engine validator.

const optionInput = z.object({
  value: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
})

const validationInput = z
  .object({
    minLength: z.number().int().min(0).max(LIMITS.paragraphMax),
    maxLength: z.number().int().min(1).max(LIMITS.paragraphMax),
    min: z.number(),
    max: z.number(),
    integerOnly: z.boolean(),
    minDate: z.iso.date(),
    maxDate: z.iso.date(),
    minSelections: z.number().int().min(0).max(LIMITS.maxOptions),
    maxSelections: z.number().int().min(1).max(LIMITS.maxOptions),
    maxFiles: z.number().int().min(1).max(LIMITS.maxFilesPerField),
    maxFileSizeMb: z.number().int().min(1).max(LIMITS.maxFileSizeMb),
    allowedExtensions: z.array(z.enum(FILE_EXTENSIONS)).max(FILE_EXTENSIONS.length),
  })
  .partial()

const stepInput = z.object({
  key: keySchema,
  title: requiredText(1, 120),
  description: optionalText(500),
})

const fieldInput = z.object({
  key: keySchema,
  type: z.enum(FIELD_TYPES),
  label: requiredText(1, 300),
  description: optionalText(1000),
  placeholder: optionalText(200),
  required: z.boolean().default(false),
  role: z.enum(['RESPONDENT_NAME', 'RESPONDENT_EMAIL']).nullish(),
  stepKey: keySchema,
  options: z.array(optionInput).max(LIMITS.maxOptions).optional(),
  validation: validationInput.optional(),
})

const conditionInput = z.object({
  fieldKey: keySchema,
  operator: z.enum(OPERATORS),
  value: z
    .union([z.string().max(500), z.number(), z.array(z.string().max(100)).max(LIMITS.maxOptions)])
    .optional(),
})

// The engine allows three levels of nesting, so the levels are spelled out instead of using a
// recursive schema. That keeps the OpenAPI document free of circular references.
const combinator = z.enum(['AND', 'OR'])
const groupLevel3 = z.object({
  combinator,
  conditions: z.array(conditionInput).max(LIMITS.maxConditionsPerGroup),
})
const groupLevel2 = z.object({
  combinator,
  conditions: z.array(z.union([conditionInput, groupLevel3])).max(LIMITS.maxConditionsPerGroup),
})
const groupLevel1 = z.object({
  combinator,
  conditions: z.array(z.union([conditionInput, groupLevel2])).max(LIMITS.maxConditionsPerGroup),
})

const ruleInput = z.object({
  key: keySchema,
  type: z.enum(RULE_TYPES),
  name: optionalText(120),
  conditions: groupLevel1,
  targetFieldKeys: z.array(keySchema).max(LIMITS.maxFields).default([]),
  enabled: z.boolean().default(true),
})

export const definitionInput = z.object({
  steps: z.array(stepInput).min(1).max(LIMITS.maxSteps),
  fields: z.array(fieldInput).max(LIMITS.maxFields),
  rules: z.array(ruleInput).max(LIMITS.maxRules),
})

// ─── Definition (output) ─────────────────────────────────────────────────────

const optionOutput = z.object({ value: z.string(), label: z.string() })

const validationOutput = z.object({
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  integerOnly: z.boolean().optional(),
  minDate: z.string().optional(),
  maxDate: z.string().optional(),
  minSelections: z.number().optional(),
  maxSelections: z.number().optional(),
  maxFiles: z.number().optional(),
  maxFileSizeMb: z.number().optional(),
  allowedExtensions: z.array(z.string()).optional(),
})

const fieldOutput = z
  .object({
    key: z.string(),
    type: z.enum(FIELD_TYPES),
    label: z.string(),
    description: z.string().nullable(),
    placeholder: z.string().nullable(),
    required: z.boolean(),
    role: z.enum(['RESPONDENT_NAME', 'RESPONDENT_EMAIL']).nullable(),
    stepKey: z.string(),
    options: z.array(optionOutput).optional(),
    validation: validationOutput.optional(),
  })
  .meta({ id: 'FormField' })

const conditionOutput = z.object({
  fieldKey: z.string(),
  operator: z.enum(OPERATORS),
  value: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
})
const groupOut3 = z.object({ combinator, conditions: z.array(conditionOutput) })
const groupOut2 = z.object({
  combinator,
  conditions: z.array(z.union([conditionOutput, groupOut3])),
})
const groupOut1 = z.object({
  combinator,
  conditions: z.array(z.union([conditionOutput, groupOut2])),
})

const ruleOutput = z
  .object({
    key: z.string(),
    type: z.enum(RULE_TYPES),
    name: z.string().nullable(),
    conditions: groupOut1,
    targetFieldKeys: z.array(z.string()),
    enabled: z.boolean(),
  })
  .meta({ id: 'FormRule' })

export const definitionOutput = z
  .object({
    steps: z.array(
      z.object({ key: z.string(), title: z.string(), description: z.string().nullable() }),
    ),
    fields: z.array(fieldOutput),
    rules: z.array(ruleOutput),
  })
  .meta({ id: 'FormDefinition' })

// ─── Form settings ───────────────────────────────────────────────────────────

export const createFormBody = z.object({
  title: requiredText(2, 160),
  description: optionalText(2000),
  purpose: formPurposeSchema.default('GENERAL'),
  /** Attach the form to an event. Required for REGISTRATION forms. */
  eventId: z.uuid().nullish(),
  /** Create the form inside an organisation workspace (ignored when an event is given). */
  organizationId: z.uuid().nullish(),
})

export const updateFormBody = z
  .object({
    title: requiredText(2, 160),
    description: optionalText(2000),
    /** Stop accepting responses at this instant. Null removes the closing date. */
    closesAt: isoDateTime.nullable(),
    /** Accept at most this many QUALIFYING submissions. Null removes the limit. */
    responseLimit: z.number().int().min(1).max(1_000_000).nullable(),
    /** Reject a response whose answers to these questions match an earlier response. */
    duplicateFieldKeys: z.array(keySchema).max(5),
    /** Accept qualifying responses automatically, or hold them for an organiser decision. */
    autoAccept: z.boolean(),
    confirmationMessage: optionalText(1000),
    sendConfirmationEmail: z.boolean(),
    /** Delete responses automatically after this many days. Null keeps them until deleted. */
    retentionDays: z.number().int().min(1).max(3650).nullable(),
  })
  .partial()

export const formListQuery = paginationQuery.extend({
  eventId: z.uuid().optional(),
  purpose: formPurposeSchema.optional(),
  status: formStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
  /** `standalone` lists only forms that are not attached to an event. */
  scope: z.enum(['all', 'standalone']).default('all'),
})

const formAvailability = z.object({
  /** Whether a response would be accepted right now. */
  open: z.boolean(),
  reason: z.enum(['OPEN', 'NOT_PUBLISHED', 'CLOSED', 'FULL']),
})

const formCounts = z.object({
  received: z.number().int(),
  qualifying: z.number().int(),
  excluded: z.number().int(),
})

const formSummaryFields = {
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  purpose: formPurposeSchema,
  status: formStatusSchema,
  eventId: z.uuid().nullable(),
  event: z.object({ id: z.uuid(), slug: z.string(), title: z.string() }).nullable(),
  organizationId: z.uuid().nullable(),
  /** True when this form creates registrations (and tickets) for its event. */
  isRegistrationForm: z.boolean(),
  closesAt: z.date().nullable(),
  responseLimit: z.number().int().nullable(),
  availability: formAvailability,
  counts: formCounts,
  /** Stable public address of the form. */
  publicUrl: z.string(),
  publishedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}

export const formSummarySchema = z.object(formSummaryFields).meta({ id: 'FormSummary' })

export const formDetailSchema = z
  .object({
    ...formSummaryFields,
    duplicateFieldKeys: z.array(z.string()),
    autoAccept: z.boolean(),
    confirmationMessage: z.string().nullable(),
    sendConfirmationEmail: z.boolean(),
    retentionDays: z.number().int().nullable(),
    /** Version number that is live, if any. */
    publishedVersion: z.number().int().nullable(),
    /** Version number of the draft being edited, if there are unpublished changes. */
    draftVersion: z.number().int().nullable(),
    hasUnpublishedChanges: z.boolean(),
    /** The definition to edit: the draft when one exists, otherwise the published version. */
    definition: definitionOutput,
  })
  .meta({ id: 'FormDetail' })

export const formVersionSchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  publishedAt: z.date().nullable(),
  isLive: z.boolean(),
  fieldCount: z.number().int(),
  submissionCount: z.number().int(),
  createdAt: z.date(),
})

// ─── Public form ─────────────────────────────────────────────────────────────

export const publicFormSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    purpose: formPurposeSchema,
    open: z.boolean(),
    /** Why the form is not accepting responses, when `open` is false. */
    reason: z.enum([
      'OPEN',
      'NOT_PUBLISHED',
      'CLOSED',
      'FULL',
      'EVENT_FULL',
      'EVENT_CANCELLED',
      'EVENT_ENDED',
      'DEADLINE_PASSED',
      'NO_FORM',
      'FORM_CLOSED',
    ]),
    closesAt: z.date().nullable(),
    /** Send back with the submission so a form edited mid-way is detected. */
    versionId: z.uuid().nullable(),
    /**
     * Questions plus the SHOW and REQUIRE rules needed to render them. Exclusion rules are never
     * sent to respondents. Null when the form is not available.
     */
    definition: definitionOutput.nullable(),
    isRegistrationForm: z.boolean(),
    requiresApproval: z.boolean(),
    ticketTypes: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        description: z.string().nullable(),
        available: z.boolean(),
      }),
    ),
    event: z
      .object({
        slug: z.string(),
        title: z.string(),
        startsAt: z.date(),
        endsAt: z.date(),
        timezone: z.string(),
        mode: z.enum(['IN_PERSON', 'VIRTUAL', 'HYBRID']),
        venueName: z.string().nullable(),
        city: z.string().nullable(),
        country: z.string().nullable(),
        organizerName: z.string(),
      })
      .nullable(),
    branding: z.object({
      accentColor: z.string().nullable(),
      logoUrl: z.string().nullable(),
      bannerUrl: z.string().nullable(),
    }),
    /** Values to pre-fill for a signed-in respondent. Empty for guests. */
    prefill: z.object({ name: z.string().nullable(), email: z.string().nullable() }),
  })
  .meta({ id: 'PublicForm' })

const answerInput = z.union([
  z.string().max(LIMITS.paragraphMax + 100),
  z.number(),
  z.array(z.string().max(100)).max(LIMITS.maxOptions),
  z.null(),
])

export const submissionBody = z.object({
  /** Answers keyed by question key. Files are sent as multipart parts named `file:<questionKey>`. */
  answers: z.record(z.string().max(40), answerInput),
  /**
   * Generated once per page load by the client. A retried request with the same key returns the
   * original result instead of creating a second response.
   */
  idempotencyKey: z.uuid(),
  /** The `versionId` the form was rendered with. */
  versionId: z.uuid().optional(),
  /** Registration forms only: the chosen ticket type. Defaults to the first available type. */
  ticketTypeId: z.uuid().optional(),
})

export const submissionResultSchema = z
  .object({
    /** Always `RECEIVED`: the response was stored. It does not by itself mean it was accepted. */
    status: z.literal('RECEIVED'),
    /** Text to show the respondent. Neutral unless the response was accepted. */
    message: z.string(),
    /** Present only when the response created a registration. */
    registration: z
      .object({
        status: z.enum(['PENDING', 'CONFIRMED']),
        /** Private link for viewing the ticket or cancelling. Also emailed to the attendee. */
        manageUrl: z.string(),
      })
      .nullable(),
  })
  .meta({ id: 'SubmissionResult' })

export const formStartBody = z.object({ sessionKey: z.uuid() })
