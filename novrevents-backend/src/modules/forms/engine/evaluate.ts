import { evaluateGroup, isEmptyValue } from './conditions.js'
import {
  FILE_EXTENSIONS,
  LIMITS,
  type AnswerValue,
  type Answers,
  type FieldDef,
  type FieldError,
  type FileRef,
  type FormDefinition,
  type RuleDef,
} from './types.js'

export interface FormState {
  /** Fields the respondent can currently see, in display order. */
  visible: Set<string>
  /** Visible fields that must be answered. */
  required: Set<string>
  /** Answers with hidden fields removed. Rules only ever see these. */
  effective: Answers
}

/** Fields in display order: by step, then by position within the definition. */
export function orderedFields(definition: FormDefinition): FieldDef[] {
  const stepIndex = new Map(definition.steps.map((step, index) => [step.key, index]))
  return definition.fields
    .map((field, index) => ({
      field,
      index,
      step: stepIndex.get(field.stepKey) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.step - b.step || a.index - b.index)
    .map((entry) => entry.field)
}

function rulesByTarget(rules: RuleDef[], type: RuleDef['type']): Map<string, RuleDef[]> {
  const map = new Map<string, RuleDef[]>()
  for (const rule of rules) {
    if (!rule.enabled || rule.type !== type) continue
    for (const key of rule.targetFieldKeys) {
      const list = map.get(key)
      if (list) list.push(rule)
      else map.set(key, [rule])
    }
  }
  return map
}

/**
 * Works out which fields are visible and which are required for a set of answers.
 *
 * Visibility is resolved in display order in a single pass. A field controlled by SHOW rules is
 * visible when at least one of them matches; the rules are evaluated against the answers of fields
 * that are themselves visible, so a hidden field can never keep another field open. (The
 * definition validator guarantees SHOW rules only look at earlier fields, which is what makes one
 * pass sufficient and rules out cycles.)
 */
export function resolveFormState(definition: FormDefinition, answers: Answers): FormState {
  const fields = orderedFields(definition)
  const fieldMap = new Map(fields.map((field) => [field.key, field]))
  const showRules = rulesByTarget(definition.rules, 'SHOW')
  const requireRules = rulesByTarget(definition.rules, 'REQUIRE')

  const visible = new Set<string>()
  const effective: Answers = {}
  for (const field of fields) {
    const controlling = showRules.get(field.key)
    const shown =
      !controlling ||
      controlling.some((rule) => evaluateGroup(rule.conditions, fieldMap, effective))
    if (shown) {
      visible.add(field.key)
      effective[field.key] = answers[field.key]
    }
  }

  const required = new Set<string>()
  for (const field of fields) {
    if (!visible.has(field.key)) continue
    const conditional = requireRules.get(field.key)
    if (
      field.required ||
      conditional?.some((rule) => evaluateGroup(rule.conditions, fieldMap, effective))
    ) {
      required.add(field.key)
    }
  }
  return { visible, required, effective }
}

/** The enabled EXCLUDE rules that match. `answers` must already be limited to visible fields. */
export function matchingExclusions(definition: FormDefinition, answers: Answers): RuleDef[] {
  const fieldMap = new Map(definition.fields.map((field) => [field.key, field]))
  return definition.rules.filter(
    (rule) =>
      rule.enabled && rule.type === 'EXCLUDE' && evaluateGroup(rule.conditions, fieldMap, answers),
  )
}

// ─── Answer validation ───────────────────────────────────────────────────────

const EMAIL_PATTERN =
  /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/
const PHONE_PATTERN = /^\+?[0-9 ()\-.]{6,24}$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/

export function isValidDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

type Normalised =
  { ok: true; value: Exclude<AnswerValue, null | undefined> } | { ok: false; message: string }

const fail = (message: string): Normalised => ({ ok: false, message })

/** Checks one non-empty answer against its field and returns the canonical stored value. */
export function normaliseAnswer(field: FieldDef, raw: AnswerValue): Normalised {
  const rules = field.validation ?? {}
  switch (field.type) {
    case 'SHORT_TEXT':
    case 'PARAGRAPH': {
      if (typeof raw !== 'string') return fail('Enter text.')
      const value = raw.trim()
      const ceiling = field.type === 'SHORT_TEXT' ? LIMITS.shortTextMax : LIMITS.paragraphMax
      const max = Math.min(rules.maxLength ?? ceiling, ceiling)
      if (value.length > max) return fail(`Use at most ${max} characters.`)
      if (rules.minLength !== undefined && value.length < rules.minLength) {
        return fail(`Use at least ${rules.minLength} characters.`)
      }
      return { ok: true, value }
    }
    case 'EMAIL': {
      if (typeof raw !== 'string') return fail('Enter an email address.')
      const value = raw.trim().toLowerCase()
      if (value.length > 254 || !EMAIL_PATTERN.test(value))
        return fail('Enter a valid email address.')
      return { ok: true, value }
    }
    case 'PHONE': {
      if (typeof raw !== 'string') return fail('Enter a phone number.')
      const value = raw.trim().replace(/\s+/g, ' ')
      const digits = value.replace(/\D/g, '').length
      if (!PHONE_PATTERN.test(value) || digits < 6 || digits > 15)
        return fail('Enter a valid phone number.')
      return { ok: true, value }
    }
    case 'NUMBER': {
      const value =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string' && NUMBER_PATTERN.test(raw.trim())
            ? Number(raw.trim())
            : NaN
      if (!Number.isFinite(value)) return fail('Enter a number.')
      if (rules.integerOnly && !Number.isInteger(value)) return fail('Enter a whole number.')
      if (rules.min !== undefined && value < rules.min) return fail(`Enter ${rules.min} or more.`)
      if (rules.max !== undefined && value > rules.max) return fail(`Enter ${rules.max} or less.`)
      return { ok: true, value }
    }
    case 'DATE': {
      if (typeof raw !== 'string' || !isValidDate(raw)) return fail('Enter a valid date.')
      if (rules.minDate && raw < rules.minDate) return fail(`Choose ${rules.minDate} or later.`)
      if (rules.maxDate && raw > rules.maxDate) return fail(`Choose ${rules.maxDate} or earlier.`)
      return { ok: true, value: raw }
    }
    case 'DROPDOWN':
    case 'RADIO': {
      if (typeof raw !== 'string' || !field.options?.some((option) => option.value === raw)) {
        return fail('Choose one of the available options.')
      }
      return { ok: true, value: raw }
    }
    case 'CHECKBOX':
    case 'MULTI_SELECT': {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
        return fail('Choose from the available options.')
      }
      const allowed = new Set(field.options?.map((option) => option.value))
      const selected = [...new Set(raw as string[])]
      if (selected.some((item) => !allowed.has(item)))
        return fail('Choose from the available options.')
      if (rules.minSelections !== undefined && selected.length < rules.minSelections) {
        return fail(`Choose at least ${rules.minSelections}.`)
      }
      if (rules.maxSelections !== undefined && selected.length > rules.maxSelections) {
        return fail(`Choose at most ${rules.maxSelections}.`)
      }
      // Stored in the order the options are defined, so equal selections always compare equal.
      const order = field.options?.map((option) => option.value) ?? []
      return { ok: true, value: order.filter((value) => selected.includes(value)) }
    }
    case 'FILE': {
      const isFileList =
        Array.isArray(raw) &&
        raw.every(
          (item) =>
            typeof item === 'object' && item !== null && typeof (item as FileRef).name === 'string',
        )
      if (!isFileList) return fail('Attach a file.')
      const files = raw as FileRef[]
      const maxFiles = Math.min(rules.maxFiles ?? 1, LIMITS.maxFilesPerField)
      if (files.length > maxFiles)
        return fail(maxFiles === 1 ? 'Attach one file only.' : `Attach at most ${maxFiles} files.`)
      const maxMb = Math.min(rules.maxFileSizeMb ?? LIMITS.maxFileSizeMb, LIMITS.maxFileSizeMb)
      const allowed: readonly string[] = rules.allowedExtensions?.length
        ? rules.allowedExtensions
        : FILE_EXTENSIONS
      for (const file of files) {
        const extension = file.name.includes('.')
          ? (file.name.split('.').pop() ?? '').toLowerCase()
          : ''
        if (!allowed.includes(extension)) return fail(`Allowed file types: ${allowed.join(', ')}.`)
        if (file.size > maxMb * 1024 * 1024)
          return fail(`Each file must be ${maxMb} MB or smaller.`)
        if (file.size <= 0) return fail('The file is empty.')
      }
      return { ok: true, value: files }
    }
  }
}

export interface ValidationResult {
  state: FormState
  /** Canonical answers for visible, answered fields only. */
  values: Record<string, Exclude<AnswerValue, null | undefined>>
  errors: FieldError[]
}

/**
 * Validates a whole response: hidden fields are dropped, required fields must be answered, and
 * every answer is normalised. Unknown keys are ignored.
 */
export function validateAnswers(definition: FormDefinition, answers: Answers): ValidationResult {
  const state = resolveFormState(definition, answers)
  const values: ValidationResult['values'] = {}
  const errors: FieldError[] = []

  for (const field of orderedFields(definition)) {
    if (!state.visible.has(field.key)) continue
    const raw = answers[field.key]
    if (isEmptyValue(raw)) {
      if (state.required.has(field.key))
        errors.push({ fieldKey: field.key, message: 'This field is required.' })
      continue
    }
    const result = normaliseAnswer(field, raw)
    if (result.ok) values[field.key] = result.value
    else errors.push({ fieldKey: field.key, message: result.message })
  }
  return { state, values, errors }
}

/** Validates only the fields of one step — used by the multi-step renderer before moving on. */
export function validateStep(
  definition: FormDefinition,
  answers: Answers,
  stepKey: string,
): FieldError[] {
  const stepFields = new Set(
    definition.fields.filter((field) => field.stepKey === stepKey).map((field) => field.key),
  )
  return validateAnswers(definition, answers).errors.filter((error) =>
    stepFields.has(error.fieldKey),
  )
}

/** Steps that currently contain at least one visible field. */
export function visibleSteps(definition: FormDefinition, state: FormState) {
  return definition.steps.filter((step) =>
    definition.fields.some((field) => field.stepKey === step.key && state.visible.has(field.key)),
  )
}
