import {
  fieldKind,
  LIST_OPERATORS,
  OPERATORS_BY_KIND,
  referencedFieldKeys,
  VALUELESS_OPERATORS,
} from './conditions.js'
import { isValidDate, orderedFields } from './evaluate.js'
import {
  FIELD_TYPES,
  FILE_EXTENSIONS,
  isConditionGroup,
  LIMITS,
  RULE_TYPES,
  type Condition,
  type ConditionGroup,
  type FieldDef,
  type FormDefinition,
} from './types.js'

export interface DefinitionIssue {
  /** Location inside the definition, e.g. `fields[2].options` or `rules[0].conditions`. */
  path: string
  message: string
}

export interface DefinitionContext {
  /**
   * `draft` accepts work in progress (no fields yet, a choice question without options).
   * `publish` requires a form respondents can actually complete.
   */
  mode: 'draft' | 'publish'
  /** Registration forms must always collect a name and an email address. */
  requireRespondentFields?: boolean
  /** Field keys used by the duplicate-submission rule. */
  duplicateFieldKeys?: string[]
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/
const CHOICE_TYPES = new Set(['DROPDOWN', 'RADIO', 'CHECKBOX', 'MULTI_SELECT'])

const isPositiveInt = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0

function checkValidation(field: FieldDef, path: string, issues: DefinitionIssue[]): void {
  const rules = field.validation
  if (!rules) return
  const add = (message: string) => issues.push({ path: `${path}.validation`, message })
  const kind = fieldKind(field.type)

  if (kind === 'text') {
    if (
      rules.minLength !== undefined &&
      (!Number.isInteger(rules.minLength) || rules.minLength < 0)
    ) {
      add('Minimum length must be zero or more.')
    }
    if (rules.maxLength !== undefined && !isPositiveInt(rules.maxLength))
      add('Maximum length must be at least 1.')
    if (
      rules.minLength !== undefined &&
      rules.maxLength !== undefined &&
      rules.minLength > rules.maxLength
    ) {
      add('Minimum length cannot be greater than the maximum length.')
    }
  }
  if (kind === 'number') {
    for (const bound of [rules.min, rules.max]) {
      if (bound !== undefined && !Number.isFinite(bound)) add('Number limits must be numbers.')
    }
    if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) {
      add('The minimum cannot be greater than the maximum.')
    }
  }
  if (kind === 'date') {
    for (const bound of [rules.minDate, rules.maxDate]) {
      if (bound !== undefined && !isValidDate(bound))
        add('Date limits must be valid dates (YYYY-MM-DD).')
    }
    if (rules.minDate && rules.maxDate && rules.minDate > rules.maxDate) {
      add('The earliest date cannot be after the latest date.')
    }
  }
  if (kind === 'multi') {
    const count = field.options?.length ?? 0
    if (
      rules.minSelections !== undefined &&
      (!Number.isInteger(rules.minSelections) || rules.minSelections < 0)
    ) {
      add('Minimum selections must be zero or more.')
    }
    if (rules.maxSelections !== undefined && !isPositiveInt(rules.maxSelections)) {
      add('Maximum selections must be at least 1.')
    }
    if (rules.minSelections !== undefined && rules.minSelections > count) {
      add('Minimum selections cannot exceed the number of options.')
    }
    if (
      rules.minSelections !== undefined &&
      rules.maxSelections !== undefined &&
      rules.minSelections > rules.maxSelections
    ) {
      add('Minimum selections cannot be greater than the maximum.')
    }
  }
  if (kind === 'file') {
    if (
      rules.maxFiles !== undefined &&
      (!isPositiveInt(rules.maxFiles) || rules.maxFiles > LIMITS.maxFilesPerField)
    ) {
      add(`Allow between 1 and ${LIMITS.maxFilesPerField} files.`)
    }
    if (
      rules.maxFileSizeMb !== undefined &&
      (!isPositiveInt(rules.maxFileSizeMb) || rules.maxFileSizeMb > LIMITS.maxFileSizeMb)
    ) {
      add(`The file size limit must be between 1 and ${LIMITS.maxFileSizeMb} MB.`)
    }
    const allowed: readonly string[] = FILE_EXTENSIONS
    if (rules.allowedExtensions?.some((extension) => !allowed.includes(extension))) {
      add(`Allowed file types are: ${FILE_EXTENSIONS.join(', ')}.`)
    }
  }
}

function checkCondition(
  condition: Condition,
  path: string,
  fields: ReadonlyMap<string, FieldDef>,
  issues: DefinitionIssue[],
): void {
  const field = fields.get(condition.fieldKey)
  if (!field) {
    issues.push({ path, message: 'This condition refers to a question that no longer exists.' })
    return
  }
  const kind = fieldKind(field.type)
  if (!OPERATORS_BY_KIND[kind].includes(condition.operator)) {
    issues.push({
      path,
      message: `“${condition.operator}” cannot be used with this type of question.`,
    })
    return
  }
  const { operator, value } = condition
  if (VALUELESS_OPERATORS.includes(operator)) {
    if (value !== undefined)
      issues.push({ path: `${path}.value`, message: 'This comparison does not take a value.' })
    return
  }
  const optionValues = new Set(field.options?.map((option) => option.value))
  if (LIST_OPERATORS.includes(operator)) {
    if (!Array.isArray(value) || value.length === 0) {
      issues.push({ path: `${path}.value`, message: 'Choose at least one option to compare with.' })
    } else if (value.some((item) => !optionValues.has(item))) {
      issues.push({
        path: `${path}.value`,
        message: 'One of the compared options no longer exists.',
      })
    }
    return
  }
  if (Array.isArray(value) || value === undefined) {
    issues.push({ path: `${path}.value`, message: 'Enter a value to compare with.' })
    return
  }
  if (kind === 'single' && !optionValues.has(String(value))) {
    issues.push({ path: `${path}.value`, message: 'The compared option no longer exists.' })
  }
  if (kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    issues.push({ path: `${path}.value`, message: 'Enter a number to compare with.' })
  }
  if (kind === 'date' && (typeof value !== 'string' || !isValidDate(value))) {
    issues.push({
      path: `${path}.value`,
      message: 'Enter a valid date (YYYY-MM-DD) to compare with.',
    })
  }
  if (
    kind === 'text' &&
    (typeof value !== 'string' || value.trim() === '' || value.length > LIMITS.shortTextMax)
  ) {
    issues.push({ path: `${path}.value`, message: 'Enter the text to compare with.' })
  }
}

function checkGroup(
  group: ConditionGroup,
  path: string,
  depth: number,
  fields: ReadonlyMap<string, FieldDef>,
  issues: DefinitionIssue[],
): void {
  if (group.combinator !== 'AND' && group.combinator !== 'OR') {
    issues.push({ path: `${path}.combinator`, message: 'Use AND or OR.' })
  }
  if (depth > LIMITS.maxConditionDepth) {
    issues.push({
      path,
      message: `Conditions can be nested at most ${LIMITS.maxConditionDepth} levels deep.`,
    })
    return
  }
  if (!Array.isArray(group.conditions) || group.conditions.length === 0) {
    issues.push({ path, message: 'Add at least one condition.' })
    return
  }
  if (group.conditions.length > LIMITS.maxConditionsPerGroup) {
    issues.push({
      path,
      message: `A group can hold at most ${LIMITS.maxConditionsPerGroup} conditions.`,
    })
  }
  group.conditions.forEach((node, index) => {
    const nodePath = `${path}.conditions[${index}]`
    if (isConditionGroup(node)) checkGroup(node, nodePath, depth + 1, fields, issues)
    else checkCondition(node, nodePath, fields, issues)
  })
}

/**
 * Checks that a form definition is internally consistent. Returns every problem found; an empty
 * array means the definition is valid for the given mode.
 */
export function validateDefinition(
  definition: FormDefinition,
  context: DefinitionContext,
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = []
  const publishing = context.mode === 'publish'

  // ── Steps ──
  if (definition.steps.length === 0)
    issues.push({ path: 'steps', message: 'A form needs at least one step.' })
  if (definition.steps.length > LIMITS.maxSteps) {
    issues.push({ path: 'steps', message: `A form can have at most ${LIMITS.maxSteps} steps.` })
  }
  const stepKeys = new Set<string>()
  definition.steps.forEach((step, index) => {
    const path = `steps[${index}]`
    if (!KEY_PATTERN.test(step.key))
      issues.push({ path: `${path}.key`, message: 'Invalid step key.' })
    if (stepKeys.has(step.key))
      issues.push({ path: `${path}.key`, message: 'Step keys must be unique.' })
    stepKeys.add(step.key)
    if (!step.title?.trim())
      issues.push({ path: `${path}.title`, message: 'Give this step a title.' })
  })

  // ── Fields ──
  if (publishing && definition.fields.length === 0) {
    issues.push({ path: 'fields', message: 'Add at least one question before publishing.' })
  }
  if (definition.fields.length > LIMITS.maxFields) {
    issues.push({
      path: 'fields',
      message: `A form can have at most ${LIMITS.maxFields} questions.`,
    })
  }
  const fields = new Map<string, FieldDef>()
  const roles = new Map<string, number>()
  definition.fields.forEach((field, index) => {
    const path = `fields[${index}]`
    if (!KEY_PATTERN.test(field.key))
      issues.push({ path: `${path}.key`, message: 'Invalid question key.' })
    if (fields.has(field.key))
      issues.push({ path: `${path}.key`, message: 'Question keys must be unique.' })
    fields.set(field.key, field)
    if (!(FIELD_TYPES as readonly string[]).includes(field.type)) {
      issues.push({ path: `${path}.type`, message: 'Unknown question type.' })
      return
    }
    if (!stepKeys.has(field.stepKey))
      issues.push({ path: `${path}.stepKey`, message: 'This question is not on any step.' })
    if (!field.label?.trim())
      issues.push({ path: `${path}.label`, message: 'Give this question a label.' })

    if (CHOICE_TYPES.has(field.type)) {
      const options = field.options ?? []
      if (publishing && options.length === 0) {
        issues.push({ path: `${path}.options`, message: 'Add at least one option.' })
      }
      if (options.length > LIMITS.maxOptions) {
        issues.push({
          path: `${path}.options`,
          message: `A question can have at most ${LIMITS.maxOptions} options.`,
        })
      }
      const values = new Set<string>()
      options.forEach((option, optionIndex) => {
        const optionPath = `${path}.options[${optionIndex}]`
        if (!option.value?.trim())
          issues.push({ path: optionPath, message: 'Option values cannot be empty.' })
        if (!option.label?.trim())
          issues.push({ path: optionPath, message: 'Give this option a label.' })
        if (values.has(option.value))
          issues.push({ path: optionPath, message: 'Options must be unique.' })
        values.add(option.value)
      })
    } else if (field.options && field.options.length > 0) {
      issues.push({ path: `${path}.options`, message: 'Only choice questions can have options.' })
    }

    if (field.role) {
      roles.set(field.role, (roles.get(field.role) ?? 0) + 1)
      const expected = field.role === 'RESPONDENT_NAME' ? 'SHORT_TEXT' : 'EMAIL'
      if (field.type !== expected) {
        issues.push({
          path: `${path}.role`,
          message:
            field.role === 'RESPONDENT_NAME'
              ? 'The respondent name must be a short text question.'
              : 'The respondent email must be an email question.',
        })
      }
    }
    checkValidation(field, path, issues)
  })
  for (const [role, count] of roles) {
    if (count > 1) {
      issues.push({
        path: 'fields',
        message: `Only one question can be marked as the respondent ${role === 'RESPONDENT_NAME' ? 'name' : 'email'}.`,
      })
    }
  }

  // ── Rules ──
  if (definition.rules.length > LIMITS.maxRules) {
    issues.push({ path: 'rules', message: `A form can have at most ${LIMITS.maxRules} rules.` })
  }
  const position = new Map(orderedFields(definition).map((field, index) => [field.key, index]))
  const ruleKeys = new Set<string>()
  const shownConditionally = new Set<string>()
  definition.rules.forEach((rule, index) => {
    const path = `rules[${index}]`
    if (!KEY_PATTERN.test(rule.key))
      issues.push({ path: `${path}.key`, message: 'Invalid rule key.' })
    if (ruleKeys.has(rule.key))
      issues.push({ path: `${path}.key`, message: 'Rule keys must be unique.' })
    ruleKeys.add(rule.key)
    if (!(RULE_TYPES as readonly string[]).includes(rule.type)) {
      issues.push({ path: `${path}.type`, message: 'Unknown rule type.' })
      return
    }
    checkGroup(rule.conditions, `${path}.conditions`, 1, fields, issues)

    const targets = rule.targetFieldKeys ?? []
    if (rule.type === 'EXCLUDE') {
      if (targets.length > 0) {
        issues.push({
          path: `${path}.targetFieldKeys`,
          message: 'Exclusion rules apply to the whole response.',
        })
      }
      return
    }
    if (targets.length === 0) {
      issues.push({
        path: `${path}.targetFieldKeys`,
        message: 'Choose the question this rule applies to.',
      })
    }
    if (new Set(targets).size !== targets.length) {
      issues.push({ path: `${path}.targetFieldKeys`, message: 'A question is listed twice.' })
    }
    const referenced = referencedFieldKeys(rule.conditions)
    for (const target of targets) {
      if (!fields.has(target)) {
        issues.push({
          path: `${path}.targetFieldKeys`,
          message: 'This rule applies to a question that no longer exists.',
        })
        continue
      }
      if (rule.type === 'SHOW') {
        if (rule.enabled) shownConditionally.add(target)
        // A question may only depend on questions that come before it; this also prevents cycles.
        const targetPosition = position.get(target) ?? -1
        if (
          referenced.some((key) => fields.has(key) && (position.get(key) ?? 0) >= targetPosition)
        ) {
          issues.push({
            path: `${path}.conditions`,
            message: 'A question can only be shown based on answers to earlier questions.',
          })
        }
      } else if (referenced.includes(target)) {
        issues.push({
          path: `${path}.conditions`,
          message: 'A question cannot be required based on its own answer.',
        })
      }
    }
  })

  // ── Requirements that only matter once the form goes live ──
  if (publishing && context.requireRespondentFields) {
    for (const role of ['RESPONDENT_NAME', 'RESPONDENT_EMAIL'] as const) {
      const label = role === 'RESPONDENT_NAME' ? 'name' : 'email'
      const field = definition.fields.find((candidate) => candidate.role === role)
      if (!field) {
        issues.push({
          path: 'fields',
          message: `A registration form needs a question marked as the attendee ${label}.`,
        })
      } else if (!field.required || shownConditionally.has(field.key)) {
        issues.push({
          path: 'fields',
          message: `The attendee ${label} question must be required and always visible.`,
        })
      }
    }
  }
  for (const key of context.duplicateFieldKeys ?? []) {
    const field = fields.get(key)
    if (!field) {
      issues.push({
        path: 'duplicateFieldKeys',
        message: 'The duplicate rule refers to a question that no longer exists.',
      })
    } else if (field.type === 'FILE') {
      issues.push({
        path: 'duplicateFieldKeys',
        message: 'File questions cannot be used to detect duplicates.',
      })
    }
  }

  return issues
}
