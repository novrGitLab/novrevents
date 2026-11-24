import type { ConditionGroup, FieldDef, FieldType, FormDefinition, RuleDef } from '@/lib/form-engine'

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  SHORT_TEXT: 'Short text',
  PARAGRAPH: 'Paragraph',
  EMAIL: 'Email',
  PHONE: 'Phone',
  NUMBER: 'Number',
  DATE: 'Date',
  DROPDOWN: 'Dropdown',
  RADIO: 'Single choice (radio)',
  CHECKBOX: 'Checkboxes',
  MULTI_SELECT: 'Multi-select list',
  FILE: 'File upload',
}

export const CHOICE_TYPES: FieldType[] = ['DROPDOWN', 'RADIO', 'CHECKBOX', 'MULTI_SELECT']

export const OPERATOR_LABELS: Record<string, string> = {
  equals: 'is',
  not_equals: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
  greater_than: 'is greater than',
  greater_or_equal: 'is at least',
  less_than: 'is less than',
  less_or_equal: 'is at most',
  is_any_of: 'is any of',
  is_none_of: 'is none of',
  includes_any: 'includes any of',
  includes_all: 'includes all of',
  includes_none: 'includes none of',
  is_empty: 'is not answered',
  is_not_empty: 'is answered',
}

export const RULE_TYPE_TEXT = {
  SHOW: {
    label: 'Show questions',
    help: 'The chosen questions appear only when the conditions match. Conditions can only use earlier questions.',
  },
  REQUIRE: {
    label: 'Require questions',
    help: 'The chosen questions become required when the conditions match.',
  },
  EXCLUDE: {
    label: 'Exclude response',
    help: 'Matching responses are stored and marked excluded. They do not count toward the response limit, never receive a ticket, and the respondent sees a neutral “received” message.',
  },
} as const

/** Turns a label into a unique question key (`[a-z][a-z0-9_]{0,39}`). */
export function keyFromLabel(label: string, taken: Set<string>, fallback = 'question'): string {
  let base = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
  if (!/^[a-z]/.test(base)) base = `${fallback}_${base}`.replace(/_+$/, '')
  let key = base
  let counter = 2
  while (taken.has(key)) key = `${base.slice(0, 36)}_${counter++}`
  return key
}

export function optionValue(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'option'
  let value = base
  let counter = 2
  while (taken.has(value)) value = `${base}_${counter++}`
  return value
}

export function newField(definition: FormDefinition, type: FieldType, stepKey: string): FieldDef {
  const taken = new Set(definition.fields.map((field) => field.key))
  const label = FIELD_TYPE_LABELS[type]
  const field: FieldDef = { key: keyFromLabel(label, taken), type, label, required: false, stepKey }
  if (CHOICE_TYPES.includes(type)) {
    field.options = [
      { value: 'option_1', label: 'Option 1' },
      { value: 'option_2', label: 'Option 2' },
    ]
  }
  if (type === 'FILE') field.validation = { maxFiles: 1, maxFileSizeMb: 10, allowedExtensions: ['pdf'] }
  return field
}

export function newRule(definition: FormDefinition, type: RuleDef['type']): RuleDef {
  const taken = new Set(definition.rules.map((rule) => rule.key))
  let index = definition.rules.length + 1
  while (taken.has(`rule_${index}`)) index += 1
  const firstChoice = definition.fields.find((field) => CHOICE_TYPES.includes(field.type))
  const conditions: ConditionGroup = {
    combinator: 'AND',
    conditions: firstChoice
      ? [
          {
            fieldKey: firstChoice.key,
            operator:
              firstChoice.type === 'CHECKBOX' || firstChoice.type === 'MULTI_SELECT'
                ? 'includes_any'
                : 'equals',
            value:
              firstChoice.type === 'CHECKBOX' || firstChoice.type === 'MULTI_SELECT'
                ? [firstChoice.options?.[0]?.value ?? '']
                : (firstChoice.options?.[0]?.value ?? ''),
          },
        ]
      : definition.fields[0]
        ? [{ fieldKey: definition.fields[0].key, operator: 'is_not_empty' }]
        : [],
  }
  return { key: `rule_${index}`, type, name: null, conditions, targetFieldKeys: [], enabled: true }
}

/**
 * When a question is renamed or removed the rules that reference it must follow, otherwise the
 * definition becomes invalid. Removing a question drops conditions and targets that used it.
 */
export function removeFieldEverywhere(definition: FormDefinition, key: string): FormDefinition {
  const prune = (group: ConditionGroup): ConditionGroup => ({
    combinator: group.combinator,
    conditions: group.conditions
      .map((node) => ('combinator' in node ? prune(node) : node))
      .filter((node) => ('combinator' in node ? node.conditions.length > 0 : node.fieldKey !== key)),
  })
  return {
    ...definition,
    fields: definition.fields.filter((field) => field.key !== key),
    rules: definition.rules
      .map((rule) => ({
        ...rule,
        conditions: prune(rule.conditions),
        targetFieldKeys: rule.targetFieldKeys.filter((target) => target !== key),
      }))
      .filter((rule) => rule.conditions.conditions.length > 0),
  }
}

export function renameFieldEverywhere(definition: FormDefinition, from: string, to: string): FormDefinition {
  const rename = (group: ConditionGroup): ConditionGroup => ({
    combinator: group.combinator,
    conditions: group.conditions.map((node) =>
      'combinator' in node ? rename(node) : node.fieldKey === from ? { ...node, fieldKey: to } : node,
    ),
  })
  return {
    ...definition,
    fields: definition.fields.map((field) => (field.key === from ? { ...field, key: to } : field)),
    rules: definition.rules.map((rule) => ({
      ...rule,
      conditions: rename(rule.conditions),
      targetFieldKeys: rule.targetFieldKeys.map((target) => (target === from ? to : target)),
    })),
  }
}

/** Normalises API output (nullable fields) into the engine's definition shape. */
export function toDefinition(value: {
  steps: unknown[]
  fields: unknown[]
  rules: unknown[]
}): FormDefinition {
  return JSON.parse(JSON.stringify(value)) as FormDefinition
}
