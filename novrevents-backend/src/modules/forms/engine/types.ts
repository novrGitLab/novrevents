/**
 * NOVR Events form engine — shared data model.
 *
 * The engine (everything in this folder) is pure TypeScript with no runtime dependencies. The
 * backend copy is authoritative: every submission is re-evaluated here. The frontend keeps an
 * identical copy in `src/lib/form-engine` to drive conditional fields and inline validation.
 * Keep the two folders in sync when changing engine behaviour.
 */

export const FIELD_TYPES = [
  'SHORT_TEXT',
  'PARAGRAPH',
  'EMAIL',
  'PHONE',
  'NUMBER',
  'DATE',
  'DROPDOWN',
  'RADIO',
  'CHECKBOX',
  'MULTI_SELECT',
  'FILE',
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export type FieldRole = 'RESPONDENT_NAME' | 'RESPONDENT_EMAIL'

export interface FieldOption {
  /** Stable identifier stored in answers and referenced by rules. */
  value: string
  /** Text shown to the respondent. */
  label: string
}

export interface FieldValidation {
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  integerOnly?: boolean
  /** Inclusive bounds for DATE fields, `YYYY-MM-DD`. */
  minDate?: string
  maxDate?: string
  minSelections?: number
  maxSelections?: number
  maxFiles?: number
  maxFileSizeMb?: number
  allowedExtensions?: string[]
}

export interface FieldDef {
  key: string
  type: FieldType
  label: string
  description?: string | null
  placeholder?: string | null
  required: boolean
  role?: FieldRole | null
  stepKey: string
  options?: FieldOption[]
  validation?: FieldValidation
}

export interface StepDef {
  key: string
  title: string
  description?: string | null
}

export const OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
  'is_any_of',
  'is_none_of',
  'includes_any',
  'includes_all',
  'includes_none',
  'is_empty',
  'is_not_empty',
] as const
export type Operator = (typeof OPERATORS)[number]

export interface Condition {
  fieldKey: string
  operator: Operator
  /** Omitted for `is_empty` / `is_not_empty`. An array for the `is_*_of` / `includes_*` operators. */
  value?: string | number | string[]
}

export interface ConditionGroup {
  combinator: 'AND' | 'OR'
  conditions: Array<Condition | ConditionGroup>
}

export const RULE_TYPES = ['SHOW', 'REQUIRE', 'EXCLUDE'] as const
/**
 * SHOW     target fields are visible only while the conditions match
 * REQUIRE  target fields become required while the conditions match
 * EXCLUDE  the submission is stored but marked EXCLUDED when the conditions match
 */
export type RuleType = (typeof RULE_TYPES)[number]

export interface RuleDef {
  key: string
  type: RuleType
  name?: string | null
  conditions: ConditionGroup
  targetFieldKeys: string[]
  enabled: boolean
}

export interface FormDefinition {
  steps: StepDef[]
  fields: FieldDef[]
  rules: RuleDef[]
}

/** Metadata about an uploaded file as the engine sees it (content checks happen elsewhere). */
export interface FileRef {
  name: string
  size: number
}

export type AnswerValue = string | number | string[] | FileRef[] | null | undefined
export type Answers = Record<string, AnswerValue>

export interface FieldError {
  fieldKey: string
  message: string
}

export const isConditionGroup = (node: Condition | ConditionGroup): node is ConditionGroup =>
  'combinator' in node

// ─── Limits shared by the builder, the renderer and the API ──────────────────

export const LIMITS = {
  maxSteps: 20,
  maxFields: 100,
  maxOptions: 100,
  maxRules: 50,
  maxConditionsPerGroup: 20,
  maxConditionDepth: 3,
  shortTextMax: 500,
  paragraphMax: 5000,
  maxFilesPerField: 5,
  maxFileSizeMb: 10,
} as const

export const FILE_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'docx',
  'pptx',
  'xlsx',
  'txt',
  'csv',
  'md',
] as const
