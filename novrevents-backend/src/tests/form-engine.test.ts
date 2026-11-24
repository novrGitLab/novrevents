import { describe, expect, it } from 'vitest'
import {
  evaluateCondition,
  evaluateGroup,
  matchingExclusions,
  resolveFormState,
  validateAnswers,
  validateDefinition,
  validateStep,
  visibleSteps,
  type Condition,
  type ConditionGroup,
  type FieldDef,
  type FormDefinition,
  type RuleDef,
} from '../modules/forms/engine/index.js'

// These tests exercise the pure engine. The frontend keeps the same file against its own copy of
// the engine, which is how the two implementations are kept in step.

const field = (overrides: Partial<FieldDef> & Pick<FieldDef, 'key' | 'type'>): FieldDef => ({
  label: overrides.key,
  required: false,
  stepKey: 'main',
  ...overrides,
})

const choices = (...values: string[]) =>
  values.map((value) => ({ value, label: value.toUpperCase() }))

const rule = (
  overrides: Partial<RuleDef> & Pick<RuleDef, 'key' | 'type' | 'conditions'>,
): RuleDef => ({
  targetFieldKeys: [],
  enabled: true,
  ...overrides,
})

const all = (...conditions: ConditionGroup['conditions']): ConditionGroup => ({
  combinator: 'AND',
  conditions,
})
const any = (...conditions: ConditionGroup['conditions']): ConditionGroup => ({
  combinator: 'OR',
  conditions,
})

const fields = {
  name: field({ key: 'name', type: 'SHORT_TEXT' }),
  age: field({ key: 'age', type: 'NUMBER' }),
  date: field({ key: 'date', type: 'DATE' }),
  role: field({
    key: 'role',
    type: 'RADIO',
    options: choices('student', 'professional', 'vendor'),
  }),
  topics: field({ key: 'topics', type: 'CHECKBOX', options: choices('appsec', 'cloud', 'dfir') }),
  cv: field({ key: 'cv', type: 'FILE' }),
}

describe('conditions', () => {
  it('compares text case-insensitively and ignores surrounding space', () => {
    expect(
      evaluateCondition(
        { fieldKey: 'name', operator: 'equals', value: 'ada' },
        fields.name,
        '  ADA ',
      ),
    ).toBe(true)
    expect(
      evaluateCondition(
        { fieldKey: 'name', operator: 'contains', value: 'LOVE' },
        fields.name,
        'Ada Lovelace',
      ),
    ).toBe(true)
    expect(
      evaluateCondition(
        { fieldKey: 'name', operator: 'not_contains', value: 'x' },
        fields.name,
        'Ada',
      ),
    ).toBe(true)
    expect(
      evaluateCondition(
        { fieldKey: 'name', operator: 'equals', value: 'ada' },
        fields.name,
        'grace',
      ),
    ).toBe(false)
  })

  it('compares numbers and dates by order', () => {
    expect(
      evaluateCondition(
        { fieldKey: 'age', operator: 'greater_or_equal', value: 18 },
        fields.age,
        18,
      ),
    ).toBe(true)
    expect(
      evaluateCondition({ fieldKey: 'age', operator: 'less_than', value: 18 }, fields.age, 18),
    ).toBe(false)
    expect(
      evaluateCondition({ fieldKey: 'age', operator: 'equals', value: 0 }, fields.age, 0),
    ).toBe(true)
    expect(
      evaluateCondition(
        { fieldKey: 'date', operator: 'greater_than', value: '2026-01-31' },
        fields.date,
        '2026-02-01',
      ),
    ).toBe(true)
    expect(
      evaluateCondition(
        { fieldKey: 'date', operator: 'less_or_equal', value: '2026-01-31' },
        fields.date,
        '2026-02-01',
      ),
    ).toBe(false)
  })

  it('matches single and multiple choice answers', () => {
    expect(
      evaluateCondition(
        { fieldKey: 'role', operator: 'equals', value: 'student' },
        fields.role,
        'student',
      ),
    ).toBe(true)
    expect(
      evaluateCondition(
        { fieldKey: 'role', operator: 'is_any_of', value: ['vendor', 'student'] },
        fields.role,
        'student',
      ),
    ).toBe(true)
    expect(
      evaluateCondition(
        { fieldKey: 'role', operator: 'is_none_of', value: ['vendor'] },
        fields.role,
        'student',
      ),
    ).toBe(true)
    expect(
      evaluateCondition(
        { fieldKey: 'topics', operator: 'includes_any', value: ['dfir', 'cloud'] },
        fields.topics,
        ['cloud'],
      ),
    ).toBe(true)
    expect(
      evaluateCondition(
        { fieldKey: 'topics', operator: 'includes_all', value: ['dfir', 'cloud'] },
        fields.topics,
        ['cloud'],
      ),
    ).toBe(false)
    expect(
      evaluateCondition(
        { fieldKey: 'topics', operator: 'includes_none', value: ['dfir'] },
        fields.topics,
        ['cloud'],
      ),
    ).toBe(true)
  })

  it('treats unanswered fields consistently', () => {
    for (const empty of [undefined, null, '', '   ', []]) {
      expect(
        evaluateCondition({ fieldKey: 'name', operator: 'is_empty' }, fields.name, empty),
      ).toBe(true)
      expect(
        evaluateCondition({ fieldKey: 'name', operator: 'is_not_empty' }, fields.name, empty),
      ).toBe(false)
    }
    // Zero is an answer, not an empty value.
    expect(evaluateCondition({ fieldKey: 'age', operator: 'is_empty' }, fields.age, 0)).toBe(false)
    // Positive comparisons never match an empty answer; negative ones always do.
    expect(
      evaluateCondition(
        { fieldKey: 'role', operator: 'equals', value: 'student' },
        fields.role,
        undefined,
      ),
    ).toBe(false)
    expect(
      evaluateCondition(
        { fieldKey: 'role', operator: 'not_equals', value: 'student' },
        fields.role,
        undefined,
      ),
    ).toBe(true)
    expect(
      evaluateCondition(
        { fieldKey: 'age', operator: 'less_than', value: 5 },
        fields.age,
        undefined,
      ),
    ).toBe(false)
    expect(
      evaluateCondition({ fieldKey: 'cv', operator: 'is_not_empty' }, fields.cv, [
        { name: 'cv.pdf', size: 10 },
      ]),
    ).toBe(true)
  })

  it('is false for unknown fields and operators that do not apply', () => {
    expect(
      evaluateCondition({ fieldKey: 'ghost', operator: 'is_empty' }, undefined, undefined),
    ).toBe(false)
    expect(
      evaluateCondition({ fieldKey: 'age', operator: 'contains', value: '1' }, fields.age, 11),
    ).toBe(false)
    expect(
      evaluateCondition({ fieldKey: 'cv', operator: 'equals', value: 'x' }, fields.cv, []),
    ).toBe(false)
  })

  it('combines conditions with AND, OR and nesting', () => {
    const map = new Map(Object.entries(fields))
    const answers = { role: 'student', age: 17, topics: ['cloud'] }
    const student = { fieldKey: 'role', operator: 'equals', value: 'student' } as const
    const adult = { fieldKey: 'age', operator: 'greater_or_equal', value: 18 } as const
    const likesCloud: Condition = { fieldKey: 'topics', operator: 'includes_any', value: ['cloud'] }

    expect(evaluateGroup(all(student, adult), map, answers)).toBe(false)
    expect(evaluateGroup(any(student, adult), map, answers)).toBe(true)
    // (student AND adult) OR (student AND likes cloud)
    expect(evaluateGroup(any(all(student, adult), all(student, likesCloud)), map, answers)).toBe(
      true,
    )
    // student AND (adult OR vendor)
    expect(
      evaluateGroup(
        all(student, any(adult, { fieldKey: 'role', operator: 'equals', value: 'vendor' })),
        map,
        answers,
      ),
    ).toBe(false)
    // An empty group never matches, so an unfinished rule cannot fire.
    expect(evaluateGroup(all(), map, answers)).toBe(false)
    expect(evaluateGroup(any(), map, answers)).toBe(false)
  })
})

const definition: FormDefinition = {
  steps: [
    { key: 'main', title: 'About you' },
    { key: 'extra', title: 'More' },
  ],
  fields: [
    field({ key: 'full_name', type: 'SHORT_TEXT', required: true, role: 'RESPONDENT_NAME' }),
    field({ key: 'email', type: 'EMAIL', required: true, role: 'RESPONDENT_EMAIL' }),
    field({
      key: 'attendee_type',
      type: 'RADIO',
      required: true,
      options: choices('student', 'professional', 'vendor'),
    }),
    field({ key: 'school', type: 'SHORT_TEXT' }),
    field({ key: 'student_id', type: 'SHORT_TEXT' }),
    field({ key: 'company', type: 'SHORT_TEXT' }),
    field({ key: 'years', type: 'NUMBER', validation: { min: 0, max: 60, integerOnly: true } }),
    field({
      key: 'interests',
      type: 'CHECKBOX',
      stepKey: 'extra',
      options: choices('appsec', 'cloud', 'dfir'),
      validation: { maxSelections: 2 },
    }),
    field({ key: 'dietary', type: 'PARAGRAPH', stepKey: 'extra' }),
  ],
  rules: [
    rule({
      key: 'show_school',
      type: 'SHOW',
      targetFieldKeys: ['school'],
      conditions: all({ fieldKey: 'attendee_type', operator: 'equals', value: 'student' }),
    }),
    // student_id depends on school, which is itself conditional (a chain).
    rule({
      key: 'show_student_id',
      type: 'SHOW',
      targetFieldKeys: ['student_id'],
      conditions: all({ fieldKey: 'school', operator: 'is_not_empty' }),
    }),
    rule({
      key: 'show_company',
      type: 'SHOW',
      targetFieldKeys: ['company', 'years'],
      conditions: any({
        fieldKey: 'attendee_type',
        operator: 'is_any_of',
        value: ['professional', 'vendor'],
      }),
    }),
    rule({
      key: 'require_company',
      type: 'REQUIRE',
      targetFieldKeys: ['company'],
      conditions: all({ fieldKey: 'attendee_type', operator: 'equals', value: 'vendor' }),
    }),
    rule({
      key: 'no_vendors',
      type: 'EXCLUDE',
      name: 'Vendors are not eligible',
      conditions: all({ fieldKey: 'attendee_type', operator: 'equals', value: 'vendor' }),
    }),
    rule({
      key: 'junior_cloud',
      type: 'EXCLUDE',
      name: 'Junior cloud only',
      conditions: all(
        { fieldKey: 'years', operator: 'less_than', value: 2 },
        { fieldKey: 'interests', operator: 'includes_any', value: ['cloud'] },
      ),
    }),
    rule({
      key: 'disabled_rule',
      type: 'EXCLUDE',
      enabled: false,
      conditions: all({ fieldKey: 'full_name', operator: 'is_not_empty' }),
    }),
  ],
}

describe('conditional fields', () => {
  it('shows different questions depending on earlier answers', () => {
    const student = resolveFormState(definition, { attendee_type: 'student' })
    expect(student.visible.has('school')).toBe(true)
    expect(student.visible.has('company')).toBe(false)

    const professional = resolveFormState(definition, { attendee_type: 'professional' })
    expect(professional.visible.has('school')).toBe(false)
    expect(professional.visible.has('company')).toBe(true)
    expect(professional.visible.has('years')).toBe(true)

    const undecided = resolveFormState(definition, {})
    expect([...undecided.visible]).toEqual([
      'full_name',
      'email',
      'attendee_type',
      'interests',
      'dietary',
    ])
  })

  it('does not let a hidden field keep a dependent field open', () => {
    // school was filled in while "student" was selected, then the respondent switched to professional.
    const state = resolveFormState(definition, {
      attendee_type: 'professional',
      school: 'FUT Minna',
      student_id: 'S123',
    })
    expect(state.visible.has('school')).toBe(false)
    expect(state.visible.has('student_id')).toBe(false)
    expect(state.effective).not.toHaveProperty('school')
    expect(state.effective).not.toHaveProperty('student_id')
  })

  it('requires particular fields for specific selections', () => {
    expect(
      resolveFormState(definition, { attendee_type: 'professional' }).required.has('company'),
    ).toBe(false)
    expect(resolveFormState(definition, { attendee_type: 'vendor' }).required.has('company')).toBe(
      true,
    )
    // A hidden field is never required, whatever the rules say.
    expect(resolveFormState(definition, { attendee_type: 'student' }).required.has('company')).toBe(
      false,
    )
  })

  it('skips steps that have no visible questions', () => {
    const only: FormDefinition = {
      steps: definition.steps,
      fields: [
        field({ key: 'a', type: 'RADIO', options: choices('yes', 'no') }),
        field({ key: 'b', type: 'SHORT_TEXT', stepKey: 'extra' }),
      ],
      rules: [
        rule({
          key: 'r',
          type: 'SHOW',
          targetFieldKeys: ['b'],
          conditions: all({ fieldKey: 'a', operator: 'equals', value: 'yes' }),
        }),
      ],
    }
    expect(visibleSteps(only, resolveFormState(only, { a: 'no' })).map((step) => step.key)).toEqual(
      ['main'],
    )
    expect(
      visibleSteps(only, resolveFormState(only, { a: 'yes' })).map((step) => step.key),
    ).toEqual(['main', 'extra'])
  })
})

describe('answer validation', () => {
  const valid = {
    full_name: '  Ada Lovelace ',
    email: 'ADA@Example.org ',
    attendee_type: 'professional',
    company: 'Analytical Engines',
    years: '12',
    interests: ['dfir', 'appsec'],
  }

  it('normalises a valid response', () => {
    const result = validateAnswers(definition, valid)
    expect(result.errors).toEqual([])
    expect(result.values).toEqual({
      full_name: 'Ada Lovelace',
      email: 'ada@example.org',
      attendee_type: 'professional',
      company: 'Analytical Engines',
      years: 12,
      // Stored in option order, not selection order.
      interests: ['appsec', 'dfir'],
    })
  })

  it('reports missing required answers, including conditionally required ones', () => {
    const result = validateAnswers(definition, { attendee_type: 'vendor' })
    expect(result.errors).toEqual([
      { fieldKey: 'full_name', message: 'This field is required.' },
      { fieldKey: 'email', message: 'This field is required.' },
      { fieldKey: 'company', message: 'This field is required.' },
    ])
  })

  it('drops answers to hidden fields and ignores unknown keys', () => {
    const result = validateAnswers(definition, {
      ...valid,
      attendee_type: 'student',
      school: 'FUT Minna',
      injected: 'x',
    })
    expect(result.errors).toEqual([])
    expect(result.values).not.toHaveProperty('company')
    expect(result.values).not.toHaveProperty('years')
    expect(result.values).not.toHaveProperty('injected')
    expect(result.values.school).toBe('FUT Minna')
  })

  it('rejects answers that do not fit the question', () => {
    const messages = (answers: Record<string, unknown>) =>
      Object.fromEntries(
        validateAnswers(definition, { ...valid, ...answers } as never).errors.map((e) => [
          e.fieldKey,
          e.message,
        ]),
      )

    expect(messages({ email: 'not-an-email' }).email).toBe('Enter a valid email address.')
    expect(messages({ attendee_type: 'alien' }).attendee_type).toBe(
      'Choose one of the available options.',
    )
    expect(messages({ years: 'many' }).years).toBe('Enter a number.')
    expect(messages({ years: 2.5 }).years).toBe('Enter a whole number.')
    expect(messages({ years: 99 }).years).toBe('Enter 60 or less.')
    expect(messages({ interests: ['appsec', 'cloud', 'dfir'] }).interests).toBe('Choose at most 2.')
    expect(messages({ interests: ['hacking'] }).interests).toBe(
      'Choose from the available options.',
    )
    expect(messages({ full_name: 'x'.repeat(501) }).full_name).toBe('Use at most 500 characters.')
    expect(messages({ full_name: { $ne: null } }).full_name).toBe('Enter text.')
  })

  it('validates dates, phone numbers and file metadata', () => {
    const form: FormDefinition = {
      steps: [{ key: 'main', title: 'Main' }],
      fields: [
        field({ key: 'when', type: 'DATE', validation: { minDate: '2026-01-01' } }),
        field({ key: 'phone', type: 'PHONE' }),
        field({
          key: 'cv',
          type: 'FILE',
          validation: { maxFiles: 1, maxFileSizeMb: 2, allowedExtensions: ['pdf'] },
        }),
      ],
      rules: [],
    }
    const errorFor = (answers: Record<string, unknown>) =>
      validateAnswers(form, answers as never).errors[0]?.message

    expect(errorFor({ when: '2026-02-30' })).toBe('Enter a valid date.')
    expect(errorFor({ when: '2025-12-31' })).toBe('Choose 2026-01-01 or later.')
    expect(errorFor({ when: '2026-03-01' })).toBeUndefined()
    expect(errorFor({ phone: 'call me' })).toBe('Enter a valid phone number.')
    expect(errorFor({ phone: '+234 803 000 0000' })).toBeUndefined()
    expect(errorFor({ cv: [{ name: 'cv.exe', size: 100 }] })).toBe('Allowed file types: pdf.')
    expect(errorFor({ cv: [{ name: 'cv.pdf', size: 3 * 1024 * 1024 }] })).toBe(
      'Each file must be 2 MB or smaller.',
    )
    expect(
      errorFor({
        cv: [
          { name: 'a.pdf', size: 1 },
          { name: 'b.pdf', size: 1 },
        ],
      }),
    ).toBe('Attach one file only.')
    expect(errorFor({ cv: [{ name: 'cv.pdf', size: 1024 }] })).toBeUndefined()
  })

  it('validates one step at a time for multi-step forms', () => {
    expect(
      validateStep(definition, { attendee_type: 'student' }, 'main').map((e) => e.fieldKey),
    ).toEqual(['full_name', 'email'])
    expect(validateStep(definition, { attendee_type: 'student' }, 'extra')).toEqual([])
  })
})

describe('exclusion rules', () => {
  const evaluate = (answers: Record<string, unknown>) => {
    const { values } = validateAnswers(definition, answers as never)
    return matchingExclusions(definition, values).map((matched) => matched.key)
  }
  const base = { full_name: 'Ada', email: 'ada@example.org' }

  it('excludes submissions whose multiple-choice answer matches the configured value', () => {
    expect(evaluate({ ...base, attendee_type: 'vendor', company: 'Acme' })).toEqual(['no_vendors'])
    expect(evaluate({ ...base, attendee_type: 'student' })).toEqual([])
  })

  it('supports AND across several questions and reports every matching rule', () => {
    expect(
      evaluate({ ...base, attendee_type: 'professional', years: 1, interests: ['cloud'] }),
    ).toEqual(['junior_cloud'])
    expect(
      evaluate({ ...base, attendee_type: 'professional', years: 5, interests: ['cloud'] }),
    ).toEqual([])
    expect(
      evaluate({
        ...base,
        attendee_type: 'vendor',
        company: 'Acme',
        years: 0,
        interests: ['cloud'],
      }),
    ).toEqual(['no_vendors', 'junior_cloud'])
  })

  it('ignores disabled rules and answers hidden from the respondent', () => {
    expect(evaluate({ ...base, attendee_type: 'student' })).not.toContain('disabled_rule')
    // "years" is hidden for students, so a stale value cannot trigger the rule.
    expect(evaluate({ ...base, attendee_type: 'student', years: 0, interests: ['cloud'] })).toEqual(
      [],
    )
  })
})

describe('definition validation', () => {
  const issuesFor = (
    override: Partial<FormDefinition>,
    mode: 'draft' | 'publish' = 'publish',
    extra = {},
  ) =>
    validateDefinition({ ...definition, ...override }, { mode, ...extra }).map(
      (issue) => issue.message,
    )

  it('accepts the reference definition', () => {
    expect(
      validateDefinition(definition, {
        mode: 'publish',
        requireRespondentFields: true,
        duplicateFieldKeys: ['email'],
      }),
    ).toEqual([])
  })

  it('rejects a question shown based on a later question or on itself', () => {
    const forward = rule({
      key: 'bad',
      type: 'SHOW',
      targetFieldKeys: ['school'],
      conditions: all({ fieldKey: 'interests', operator: 'is_not_empty' }),
    })
    expect(issuesFor({ rules: [forward] })).toContain(
      'A question can only be shown based on answers to earlier questions.',
    )
    const self = rule({
      key: 'self',
      type: 'SHOW',
      targetFieldKeys: ['school'],
      conditions: all({ fieldKey: 'school', operator: 'is_not_empty' }),
    })
    expect(issuesFor({ rules: [self] })).toContain(
      'A question can only be shown based on answers to earlier questions.',
    )
  })

  it('rejects rules that reference missing questions, options or the wrong operator', () => {
    const missingField = rule({
      key: 'a',
      type: 'EXCLUDE',
      conditions: all({ fieldKey: 'ghost', operator: 'is_empty' }),
    })
    const missingOption = rule({
      key: 'b',
      type: 'EXCLUDE',
      conditions: all({ fieldKey: 'attendee_type', operator: 'equals', value: 'alien' }),
    })
    const wrongOperator = rule({
      key: 'c',
      type: 'EXCLUDE',
      conditions: all({ fieldKey: 'years', operator: 'contains', value: '1' }),
    })
    const emptyGroup = rule({ key: 'd', type: 'EXCLUDE', conditions: all() })
    const noTarget = rule({
      key: 'e',
      type: 'SHOW',
      conditions: all({ fieldKey: 'full_name', operator: 'is_not_empty' }),
    })
    const messages = issuesFor({
      rules: [missingField, missingOption, wrongOperator, emptyGroup, noTarget],
    })
    expect(messages).toEqual(
      expect.arrayContaining([
        'This condition refers to a question that no longer exists.',
        'The compared option no longer exists.',
        '“contains” cannot be used with this type of question.',
        'Add at least one condition.',
        'Choose the question this rule applies to.',
      ]),
    )
  })

  it('rejects duplicate keys and choice questions without options when publishing', () => {
    const duplicate = [
      definition.fields[0]!,
      { ...definition.fields[1]!, key: 'full_name', role: null },
    ]
    expect(issuesFor({ fields: duplicate, rules: [] })).toContain('Question keys must be unique.')

    const empty = [field({ key: 'pick', type: 'DROPDOWN', options: [] })]
    expect(issuesFor({ fields: empty, rules: [] }, 'publish')).toContain('Add at least one option.')
    // Drafts may be saved while a question is still being set up.
    expect(issuesFor({ fields: empty, rules: [] }, 'draft')).toEqual([])
    expect(issuesFor({ fields: [], rules: [] }, 'publish')).toContain(
      'Add at least one question before publishing.',
    )
  })

  it('requires an always-visible name and email on registration forms', () => {
    const withoutEmail = definition.fields.filter((item) => item.key !== 'email')
    expect(
      issuesFor({ fields: withoutEmail }, 'publish', { requireRespondentFields: true }),
    ).toContain('A registration form needs a question marked as the attendee email.')
    const hidesName = rule({
      key: 'hide',
      type: 'SHOW',
      targetFieldKeys: ['email'],
      conditions: all({ fieldKey: 'full_name', operator: 'is_not_empty' }),
    })
    expect(
      issuesFor({ rules: [hidesName] }, 'publish', { requireRespondentFields: true }),
    ).toContain('The attendee email question must be required and always visible.')
  })

  it('limits nesting depth', () => {
    const deep = rule({
      key: 'deep',
      type: 'EXCLUDE',
      conditions: all(any(all(any({ fieldKey: 'full_name', operator: 'is_not_empty' })))),
    })
    expect(issuesFor({ rules: [deep] })).toContain(
      'Conditions can be nested at most 3 levels deep.',
    )
  })
})
