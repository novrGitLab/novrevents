'use client'

import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from '@/components/ui/icons'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { Disclosure } from '@/components/ui/primitives'
import {
  FIELD_TYPES,
  FILE_EXTENSIONS,
  type FieldDef,
  type FieldType,
  type FormDefinition,
} from '@/lib/form-engine'
import { CHOICE_TYPES, FIELD_TYPE_LABELS, optionValue } from './model'

/** Properties of one question, shown in the builder's right-hand panel. */
export function FieldCard({
  field,
  definition,
  locked,
  onChange,
  onRename,
  onRemove,
  onDuplicate,
  onMove,
}: {
  field: FieldDef
  definition: FormDefinition
  locked: boolean
  onChange: (patch: Partial<FieldDef>) => void
  onRename: (key: string) => void
  onRemove: () => void
  onDuplicate: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const id = `field-${field.key}`
  const isChoice = CHOICE_TYPES.includes(field.type)
  const validation = field.validation ?? {}
  const setValidation = (patch: Record<string, unknown>) => {
    const next = { ...validation, ...patch } as Record<string, unknown>
    for (const [key, value] of Object.entries(next))
      if (value === undefined || value === '' || Number.isNaN(value)) delete next[key]
    onChange({ validation: next })
  }
  const num = (value: string) => (value === '' ? undefined : Number(value))

  const changeType = (type: FieldType) => {
    const patch: Partial<FieldDef> = { type, validation: undefined }
    if (CHOICE_TYPES.includes(type) && !field.options?.length)
      patch.options = [{ value: 'option_1', label: 'Option 1' }]
    if (!CHOICE_TYPES.includes(type)) patch.options = undefined
    if (field.role === 'RESPONDENT_EMAIL' && type !== 'EMAIL') patch.role = null
    if (field.role === 'RESPONDENT_NAME' && type !== 'SHORT_TEXT') patch.role = null
    onChange(patch)
  }

  return (
    <div className="@container space-y-4">
      <div className="flex flex-col gap-3 @md:flex-row @md:items-start">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`${id}-label`}>Question</Label>
          <Input
            id={`${id}-label`}
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
            maxLength={300}
          />
        </div>
        <div className="space-y-1.5 @md:w-56">
          <Label htmlFor={`${id}-type`}>Type</Label>
          <NativeSelect
            id={`${id}-type`}
            value={field.type}
            onChange={(event) => changeType(event.target.value as FieldType)}
            disabled={locked}
          >
            {FIELD_TYPES.map((value) => (
              <option key={value} value={value}>
                {FIELD_TYPE_LABELS[value]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-description`}>Help text</Label>
        <Textarea
          id={`${id}-description`}
          className="min-h-16"
          value={field.description ?? ''}
          onChange={(event) => onChange({ description: event.target.value || null })}
          maxLength={1000}
        />
      </div>

      {isChoice && <OptionsEditor field={field} onChange={(options) => onChange({ options })} />}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={field.required}
            onChange={(event) => onChange({ required: event.target.checked })}
          />
          Required
        </label>
        {(field.type === 'SHORT_TEXT' || field.type === 'EMAIL') && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={Boolean(field.role)}
              onChange={(event) =>
                onChange({
                  role: event.target.checked
                    ? field.type === 'EMAIL'
                      ? 'RESPONDENT_EMAIL'
                      : 'RESPONDENT_NAME'
                    : null,
                })
              }
            />
            {field.type === 'EMAIL' ? 'This is the respondent’s email' : 'This is the respondent’s name'}
          </label>
        )}
        {definition.steps.length > 1 && (
          <label className="flex items-center gap-2">
            Step
            <NativeSelect
              className="h-8 w-40"
              value={field.stepKey}
              onChange={(event) => onChange({ stepKey: event.target.value })}
            >
              {definition.steps.map((step, index) => (
                <option key={step.key} value={step.key}>
                  {index + 1}. {step.title}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
      </div>

      <Disclosure title="Validation and advanced settings">
        <div className="grid gap-3 @md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-key`}>Question key</Label>
            <Input
              id={`${id}-key`}
              className="font-mono text-xs"
              defaultValue={field.key}
              disabled={locked}
              onBlur={(event) => {
                const value = event.target.value.trim()
                if (
                  value &&
                  value !== field.key &&
                  /^[a-z][a-z0-9_]{0,39}$/.test(value) &&
                  !definition.fields.some((item) => item.key === value)
                )
                  onRename(value)
                else event.target.value = field.key
              }}
            />
            <p className="text-muted-foreground text-xs">
              {locked ? 'Locked: responses already use this key.' : 'Used in exports and rules.'}
            </p>
          </div>
          {(field.type === 'SHORT_TEXT' ||
            field.type === 'PARAGRAPH' ||
            field.type === 'EMAIL' ||
            field.type === 'PHONE' ||
            field.type === 'NUMBER') && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-placeholder`}>Placeholder</Label>
              <Input
                id={`${id}-placeholder`}
                value={field.placeholder ?? ''}
                onChange={(event) => onChange({ placeholder: event.target.value || null })}
                maxLength={200}
              />
            </div>
          )}
          {(field.type === 'SHORT_TEXT' || field.type === 'PARAGRAPH') && (
            <>
              <NumberSetting
                id={`${id}-minlen`}
                label="Minimum characters"
                value={validation.minLength}
                onChange={(value) => setValidation({ minLength: num(value) })}
              />
              <NumberSetting
                id={`${id}-maxlen`}
                label="Maximum characters"
                value={validation.maxLength}
                onChange={(value) => setValidation({ maxLength: num(value) })}
              />
            </>
          )}
          {field.type === 'NUMBER' && (
            <>
              <NumberSetting
                id={`${id}-min`}
                label="Minimum"
                value={validation.min}
                onChange={(value) => setValidation({ min: num(value) })}
              />
              <NumberSetting
                id={`${id}-max`}
                label="Maximum"
                value={validation.max}
                onChange={(value) => setValidation({ max: num(value) })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={Boolean(validation.integerOnly)}
                  onChange={(event) => setValidation({ integerOnly: event.target.checked || undefined })}
                />
                Whole numbers only
              </label>
            </>
          )}
          {field.type === 'DATE' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-mindate`}>Earliest date</Label>
                <Input
                  id={`${id}-mindate`}
                  type="date"
                  value={validation.minDate ?? ''}
                  onChange={(event) => setValidation({ minDate: event.target.value || undefined })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-maxdate`}>Latest date</Label>
                <Input
                  id={`${id}-maxdate`}
                  type="date"
                  value={validation.maxDate ?? ''}
                  onChange={(event) => setValidation({ maxDate: event.target.value || undefined })}
                />
              </div>
            </>
          )}
          {(field.type === 'CHECKBOX' || field.type === 'MULTI_SELECT') && (
            <>
              <NumberSetting
                id={`${id}-minsel`}
                label="Minimum selections"
                value={validation.minSelections}
                onChange={(value) => setValidation({ minSelections: num(value) })}
              />
              <NumberSetting
                id={`${id}-maxsel`}
                label="Maximum selections"
                value={validation.maxSelections}
                onChange={(value) => setValidation({ maxSelections: num(value) })}
              />
            </>
          )}
          {field.type === 'FILE' && (
            <>
              <NumberSetting
                id={`${id}-maxfiles`}
                label="Maximum files (1–5)"
                value={validation.maxFiles}
                onChange={(value) => setValidation({ maxFiles: num(value) })}
              />
              <NumberSetting
                id={`${id}-maxsize`}
                label="Maximum size per file, MB (1–10)"
                value={validation.maxFileSizeMb}
                onChange={(value) => setValidation({ maxFileSizeMb: num(value) })}
              />
              <fieldset className="@md:col-span-2">
                <legend className="mb-1 text-sm font-medium">Allowed file types</legend>
                <div className="flex flex-wrap gap-3">
                  {FILE_EXTENSIONS.map((extension) => {
                    const allowed = validation.allowedExtensions ?? []
                    return (
                      <label key={extension} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          className="accent-primary size-4"
                          checked={allowed.includes(extension)}
                          onChange={(event) =>
                            setValidation({
                              allowedExtensions: event.target.checked
                                ? [...allowed, extension]
                                : allowed.filter((item) => item !== extension),
                            })
                          }
                        />
                        .{extension}
                      </label>
                    )
                  })}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Leave all unticked to allow every supported type.
                </p>
              </fieldset>
            </>
          )}
        </div>
      </Disclosure>

      <div className="flex flex-wrap justify-end gap-1 border-t pt-3">
        <Button variant="ghost" size="sm" onClick={() => onMove(-1)} aria-label="Move question up">
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onMove(1)} aria-label="Move question down">
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDuplicate}>
          <Copy /> Duplicate
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={onRemove}>
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  )
}

function NumberSetting({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number | undefined
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function OptionsEditor({
  field,
  onChange,
}: {
  field: FieldDef
  onChange: (options: NonNullable<FieldDef['options']>) => void
}) {
  const options = field.options ?? []
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Options</legend>
      {options.map((option, index) => (
        <div key={option.value} className="flex items-center gap-2">
          <Input
            aria-label={`Option ${index + 1}`}
            value={option.label}
            maxLength={200}
            onChange={(event) =>
              onChange(
                options.map((item, position) =>
                  position === index ? { ...item, label: event.target.value } : item,
                ),
              )
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove option ${index + 1}`}
            disabled={options.length <= 1}
            onClick={() => onChange(options.filter((_, position) => position !== index))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const label = `Option ${options.length + 1}`
          onChange([
            ...options,
            { value: optionValue(label, new Set(options.map((option) => option.value))), label },
          ])
        }}
      >
        <Plus /> Add option
      </Button>
      <p className="text-muted-foreground text-xs">
        Renaming an option keeps existing answers and rules attached to it.
      </p>
    </fieldset>
  )
}
