'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label, NativeSelect } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import {
  fieldKind,
  LIMITS,
  LIST_OPERATORS,
  OPERATORS_BY_KIND,
  orderedFields,
  VALUELESS_OPERATORS,
  type Condition,
  type ConditionGroup,
  type FieldDef,
  type FormDefinition,
  type Operator,
  type RuleDef,
} from '@/lib/form-engine'
import { cn } from '@/lib/utils'
import { newRule, OPERATOR_LABELS, RULE_TYPE_TEXT } from './model'

export function RuleEditor({
  definition,
  onChange,
}: {
  definition: FormDefinition
  onChange: (next: FormDefinition) => void
}) {
  const setRule = (key: string, patch: Partial<RuleDef>) =>
    onChange({
      ...definition,
      rules: definition.rules.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)),
    })

  if (definition.fields.length === 0) {
    return <p className="text-muted-foreground text-sm">Add questions before creating rules.</p>
  }

  return (
    <div className="space-y-4">
      <div className="bg-muted/40 text-muted-foreground rounded-lg border p-4 text-sm">
        Rules are evaluated the same way in the browser and on the server, in order, using AND/OR condition
        groups. Exclusion rules stay private: respondents never see them.
      </div>
      {definition.rules.map((rule, index) => (
        <div
          key={rule.key}
          className={cn('bg-card space-y-4 rounded-lg border p-4 shadow-xs', !rule.enabled && 'opacity-70')}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={rule.type === 'EXCLUDE' ? 'destructive' : 'default'}>Rule {index + 1}</Badge>
            <NativeSelect
              aria-label="Rule type"
              className="h-9 w-48"
              value={rule.type}
              onChange={(event) =>
                setRule(rule.key, {
                  type: event.target.value as RuleDef['type'],
                  targetFieldKeys: event.target.value === 'EXCLUDE' ? [] : rule.targetFieldKeys,
                })
              }
            >
              {Object.entries(RULE_TYPE_TEXT).map(([value, text]) => (
                <option key={value} value={value}>
                  {text.label}
                </option>
              ))}
            </NativeSelect>
            <Input
              aria-label="Rule name"
              className="h-9 min-w-40 flex-1"
              placeholder="Name (internal, optional)"
              value={rule.name ?? ''}
              onChange={(event) => setRule(rule.key, { name: event.target.value || null })}
              maxLength={120}
            />
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={rule.enabled}
                onCheckedChange={(enabled) => setRule(rule.key, { enabled })}
                aria-label="Rule enabled"
              />{' '}
              Enabled
            </label>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete rule ${index + 1}`}
              onClick={() =>
                onChange({ ...definition, rules: definition.rules.filter((item) => item.key !== rule.key) })
              }
            >
              <Trash2 />
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{RULE_TYPE_TEXT[rule.type].help}</p>

          <div>
            <p className="mb-2 text-sm font-medium">When</p>
            <GroupEditor
              group={rule.conditions}
              definition={definition}
              depth={1}
              onChange={(conditions) => setRule(rule.key, { conditions })}
            />
          </div>

          {rule.type !== 'EXCLUDE' && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                {rule.type === 'SHOW' ? 'Then show' : 'Then require'}
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {orderedFields(definition).map((field) => (
                  <label key={field.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-primary size-4"
                      checked={rule.targetFieldKeys.includes(field.key)}
                      onChange={(event) =>
                        setRule(rule.key, {
                          targetFieldKeys: event.target.checked
                            ? [...rule.targetFieldKeys, field.key]
                            : rule.targetFieldKeys.filter((key) => key !== field.key),
                        })
                      }
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {rule.type === 'EXCLUDE' && (
            <p className="text-sm font-medium">Then mark the response as excluded.</p>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(RULE_TYPE_TEXT) as RuleDef['type'][]).map((type) => (
          <Button
            key={type}
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({ ...definition, rules: [...definition.rules, newRule(definition, type)] })
            }
            disabled={definition.rules.length >= LIMITS.maxRules}
          >
            <Plus /> {RULE_TYPE_TEXT[type].label}
          </Button>
        ))}
      </div>
    </div>
  )
}

function GroupEditor({
  group,
  definition,
  depth,
  onChange,
}: {
  group: ConditionGroup
  definition: FormDefinition
  depth: number
  onChange: (group: ConditionGroup) => void
}) {
  const setNode = (index: number, node: Condition | ConditionGroup) =>
    onChange({
      ...group,
      conditions: group.conditions.map((item, position) => (position === index ? node : item)),
    })
  const removeNode = (index: number) =>
    onChange({ ...group, conditions: group.conditions.filter((_, position) => position !== index) })
  const firstField = definition.fields[0] as FieldDef

  return (
    <div className={cn('space-y-2 rounded-lg border p-3', depth > 1 && 'bg-muted/40')}>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Match</span>
        <NativeSelect
          aria-label="Combine conditions with"
          className="h-8 w-24"
          value={group.combinator}
          onChange={(event) => onChange({ ...group, combinator: event.target.value as 'AND' | 'OR' })}
        >
          <option value="AND">ALL</option>
          <option value="OR">ANY</option>
        </NativeSelect>
        <span className="text-muted-foreground">of these ({group.combinator})</span>
      </div>
      {group.conditions.length === 0 && (
        <p className="text-destructive text-xs">Add at least one condition — an empty group never matches.</p>
      )}
      {group.conditions.map((node, index) =>
        'combinator' in node ? (
          <div key={index} className="flex gap-2">
            <div className="flex-1">
              <GroupEditor
                group={node}
                definition={definition}
                depth={depth + 1}
                onChange={(next) => setNode(index, next)}
              />
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove group"
              onClick={() => removeNode(index)}
            >
              <Trash2 />
            </Button>
          </div>
        ) : (
          <ConditionRow
            key={index}
            condition={node}
            definition={definition}
            onChange={(next) => setNode(index, next)}
            onRemove={() => removeNode(index)}
          />
        ),
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              ...group,
              conditions: [...group.conditions, { fieldKey: firstField.key, operator: 'is_not_empty' }],
            })
          }
        >
          <Plus /> Condition
        </Button>
        {depth < LIMITS.maxConditionDepth && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                ...group,
                conditions: [
                  ...group.conditions,
                  {
                    combinator: group.combinator === 'AND' ? 'OR' : 'AND',
                    conditions: [{ fieldKey: firstField.key, operator: 'is_not_empty' }],
                  },
                ],
              })
            }
          >
            <Plus /> Group
          </Button>
        )}
      </div>
    </div>
  )
}

function defaultValueFor(field: FieldDef, operator: Operator): Condition['value'] {
  if (VALUELESS_OPERATORS.includes(operator)) return undefined
  if (LIST_OPERATORS.includes(operator)) return field.options?.[0] ? [field.options[0].value] : []
  const kind = fieldKind(field.type)
  if (kind === 'single') return field.options?.[0]?.value ?? ''
  if (kind === 'number') return 0
  return ''
}

function ConditionRow({
  condition,
  definition,
  onChange,
  onRemove,
}: {
  condition: Condition
  definition: FormDefinition
  onChange: (condition: Condition) => void
  onRemove: () => void
}) {
  const field = definition.fields.find((item) => item.key === condition.fieldKey)
  const kind = field ? fieldKind(field.type) : 'text'
  const operators = OPERATORS_BY_KIND[kind]

  const valueInput = () => {
    if (!field || VALUELESS_OPERATORS.includes(condition.operator)) return null
    if (LIST_OPERATORS.includes(condition.operator)) {
      const selected = Array.isArray(condition.value) ? condition.value : []
      return (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {field.options?.map((option) => (
            <label key={option.value} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={selected.includes(option.value)}
                onChange={(event) =>
                  onChange({
                    ...condition,
                    value: event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((item) => item !== option.value),
                  })
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      )
    }
    if (kind === 'single') {
      return (
        <NativeSelect
          aria-label="Value"
          className="h-9"
          value={String(condition.value ?? '')}
          onChange={(event) => onChange({ ...condition, value: event.target.value })}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      )
    }
    if (kind === 'number') {
      return (
        <Input
          aria-label="Value"
          type="number"
          className="h-9"
          value={String(condition.value ?? '')}
          onChange={(event) =>
            onChange({ ...condition, value: event.target.value === '' ? 0 : Number(event.target.value) })
          }
        />
      )
    }
    if (kind === 'date') {
      return (
        <Input
          aria-label="Value"
          type="date"
          className="h-9"
          value={String(condition.value ?? '')}
          onChange={(event) => onChange({ ...condition, value: event.target.value })}
        />
      )
    }
    return (
      <Input
        aria-label="Value"
        className="h-9"
        value={String(condition.value ?? '')}
        onChange={(event) => onChange({ ...condition, value: event.target.value })}
        maxLength={500}
      />
    )
  }

  return (
    <div className="bg-card flex flex-col gap-2 rounded-md p-2 sm:flex-row sm:items-center">
      <Label className="sr-only">Question</Label>
      <NativeSelect
        aria-label="Question"
        className="h-9 sm:w-56"
        value={condition.fieldKey}
        onChange={(event) => {
          const next = definition.fields.find((item) => item.key === event.target.value) as FieldDef
          const operator = OPERATORS_BY_KIND[fieldKind(next.type)][0] as Operator
          onChange({ fieldKey: next.key, operator, value: defaultValueFor(next, operator) })
        }}
      >
        {!field && <option value={condition.fieldKey}>Deleted question</option>}
        {orderedFields(definition).map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Comparison"
        className="h-9 sm:w-44"
        value={condition.operator}
        onChange={(event) => {
          const operator = event.target.value as Operator
          onChange({ ...condition, operator, value: field ? defaultValueFor(field, operator) : undefined })
        }}
      >
        {operators.map((operator) => (
          <option key={operator} value={operator}>
            {OPERATOR_LABELS[operator]}
          </option>
        ))}
      </NativeSelect>
      <div className="min-w-0 flex-1">{valueInput()}</div>
      <Button variant="ghost" size="icon-sm" aria-label="Remove condition" onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  )
}
