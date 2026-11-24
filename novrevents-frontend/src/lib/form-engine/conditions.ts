import {
  isConditionGroup,
  type AnswerValue,
  type Answers,
  type Condition,
  type ConditionGroup,
  type FieldDef,
  type FieldType,
  type Operator,
} from './types'

/** How a field's answers behave in comparisons. */
export type FieldKind = 'text' | 'number' | 'date' | 'single' | 'multi' | 'file'

export function fieldKind(type: FieldType): FieldKind {
  switch (type) {
    case 'NUMBER':
      return 'number'
    case 'DATE':
      return 'date'
    case 'DROPDOWN':
    case 'RADIO':
      return 'single'
    case 'CHECKBOX':
    case 'MULTI_SELECT':
      return 'multi'
    case 'FILE':
      return 'file'
    default:
      return 'text'
  }
}

/** The operators the builder offers, and the API accepts, for each kind of field. */
export const OPERATORS_BY_KIND: Record<FieldKind, readonly Operator[]> = {
  text: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
  number: [
    'equals',
    'not_equals',
    'greater_than',
    'greater_or_equal',
    'less_than',
    'less_or_equal',
    'is_empty',
    'is_not_empty',
  ],
  date: [
    'equals',
    'not_equals',
    'greater_than',
    'greater_or_equal',
    'less_than',
    'less_or_equal',
    'is_empty',
    'is_not_empty',
  ],
  single: ['equals', 'not_equals', 'is_any_of', 'is_none_of', 'is_empty', 'is_not_empty'],
  multi: ['includes_any', 'includes_all', 'includes_none', 'is_empty', 'is_not_empty'],
  file: ['is_empty', 'is_not_empty'],
}

export const VALUELESS_OPERATORS: readonly Operator[] = ['is_empty', 'is_not_empty']
export const LIST_OPERATORS: readonly Operator[] = [
  'is_any_of',
  'is_none_of',
  'includes_any',
  'includes_all',
  'includes_none',
]

export function isEmptyValue(value: AnswerValue): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

const fold = (value: string) => value.trim().toLowerCase()

const toList = (value: Condition['value']): string[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [String(value)]

function compare(left: number | string, operator: Operator, right: number | string): boolean {
  switch (operator) {
    case 'equals':
      return left === right
    case 'greater_than':
      return left > right
    case 'greater_or_equal':
      return left >= right
    case 'less_than':
      return left < right
    case 'less_or_equal':
      return left <= right
    default:
      return false
  }
}

/**
 * Evaluates one condition against one answer. Deterministic and total: any combination that makes
 * no sense (unknown field, operator that does not apply to the field) evaluates to false.
 *
 * Negative operators (`not_equals`, `not_contains`, `is_none_of`, `includes_none`) are true for an
 * unanswered field, because an empty answer is, literally, not the compared value.
 */
export function evaluateCondition(
  condition: Condition,
  field: FieldDef | undefined,
  value: AnswerValue,
): boolean {
  if (!field) return false
  const kind = fieldKind(field.type)
  const { operator } = condition
  if (!OPERATORS_BY_KIND[kind].includes(operator)) return false

  const empty = isEmptyValue(value)
  if (operator === 'is_empty') return empty
  if (operator === 'is_not_empty') return !empty

  switch (kind) {
    case 'text': {
      const actual = typeof value === 'string' ? fold(value) : ''
      const expected = fold(String(condition.value ?? ''))
      if (operator === 'equals') return !empty && actual === expected
      if (operator === 'not_equals') return empty || actual !== expected
      if (operator === 'contains') return !empty && expected !== '' && actual.includes(expected)
      return empty || expected === '' || !actual.includes(expected)
    }
    case 'number': {
      const expected = Number(condition.value)
      if (Number.isNaN(expected)) return false
      if (operator === 'not_equals') return empty || value !== expected
      return typeof value === 'number' && compare(value, operator, expected)
    }
    case 'date': {
      // ISO `YYYY-MM-DD` strings order correctly as plain strings.
      const expected = String(condition.value ?? '')
      if (operator === 'not_equals') return empty || value !== expected
      return typeof value === 'string' && !empty && compare(value, operator, expected)
    }
    case 'single': {
      const actual = typeof value === 'string' ? value : ''
      if (operator === 'equals') return !empty && actual === String(condition.value ?? '')
      if (operator === 'not_equals') return empty || actual !== String(condition.value ?? '')
      const list = toList(condition.value)
      if (operator === 'is_any_of') return !empty && list.includes(actual)
      return empty || !list.includes(actual)
    }
    case 'multi': {
      const selected = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : []
      const list = toList(condition.value)
      if (operator === 'includes_any') return list.some((item) => selected.includes(item))
      if (operator === 'includes_all') return list.length > 0 && list.every((item) => selected.includes(item))
      return !list.some((item) => selected.includes(item))
    }
    default:
      return false
  }
}

/**
 * Evaluates a condition tree. AND needs every child to match; OR needs at least one.
 * A group with no conditions never matches, so a half-configured rule can never fire.
 */
export function evaluateGroup(
  group: ConditionGroup,
  fields: ReadonlyMap<string, FieldDef>,
  answers: Answers,
): boolean {
  if (group.conditions.length === 0) return false
  const results = group.conditions.map((node) =>
    isConditionGroup(node)
      ? evaluateGroup(node, fields, answers)
      : evaluateCondition(node, fields.get(node.fieldKey), answers[node.fieldKey]),
  )
  return group.combinator === 'AND' ? results.every(Boolean) : results.some(Boolean)
}

/** Every field key referenced anywhere in a condition tree. */
export function referencedFieldKeys(group: ConditionGroup): string[] {
  return group.conditions.flatMap((node) =>
    isConditionGroup(node) ? referencedFieldKeys(node) : [node.fieldKey],
  )
}
