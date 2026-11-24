'use client'

import { ChevronLeft, ChevronRight, Paperclip, X } from 'lucide-react'
import * as React from 'react'
import { fieldAria } from '@/components/common'
import { Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import {
  FILE_EXTENSIONS,
  LIMITS,
  resolveFormState,
  validateStep,
  visibleSteps,
  type AnswerValue,
  type Answers,
  type FieldDef,
  type FieldError,
  type FormDefinition,
} from '@/lib/form-engine'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface RendererSubmit {
  answers: Record<string, string | number | string[] | null>
  files: Array<{ fieldKey: string; file: File }>
  ticketTypeId?: string
}

interface TicketTypeOption {
  id: string
  name: string
  description: string | null
  available: boolean
}

export interface FormRendererProps {
  definition: FormDefinition
  /** Pre-fill the respondent name/email questions (signed-in users). */
  prefill?: { name: string | null; email: string | null }
  ticketTypes?: TicketTypeOption[]
  submitLabel?: string
  /** Errors returned by the server, keyed by question. */
  serverErrors?: FieldError[]
  submitting?: boolean
  disabled?: boolean
  onSubmit: (payload: RendererSubmit) => void
}

/**
 * Renders a NOVR form with the shared engine: conditional questions appear and disappear as the
 * respondent answers, and each step is validated before moving on. The server validates again.
 */
/** Stable default: a new [] on every render would retrigger the server-error sync below forever. */
const NO_ERRORS: FieldError[] = []

export function FormRenderer({
  definition,
  prefill,
  ticketTypes = [],
  submitLabel = 'Submit',
  serverErrors = NO_ERRORS,
  submitting,
  disabled,
  onSubmit,
}: FormRendererProps) {
  const [answers, setAnswers] = React.useState<Answers>(() => initialAnswers(definition, prefill))
  const [files, setFiles] = React.useState<Record<string, File[]>>({})
  const [errors, setErrors] = React.useState<FieldError[]>([])
  const [stepIndex, setStepIndex] = React.useState(0)
  const [ticketTypeId, setTicketTypeId] = React.useState(
    () => ticketTypes.find((type) => type.available)?.id ?? '',
  )
  const errorSummary = React.useRef<HTMLDivElement>(null)

  // The engine sees uploads as name/size metadata; the File objects are sent separately.
  const current: Answers = { ...answers }
  for (const [key, list] of Object.entries(files))
    current[key] = list.map((file) => ({ name: file.name, size: file.size }))
  const state = resolveFormState(definition, current)
  const steps = visibleSteps(definition, state)

  // When the server returns new field errors, show them and jump to the first affected step.
  // (State is adjusted during render, React's recommended alternative to an effect.)
  const [seenServerErrors, setSeenServerErrors] = React.useState(serverErrors)
  if (seenServerErrors !== serverErrors) {
    setSeenServerErrors(serverErrors)
    if (serverErrors.length > 0) {
      setErrors(serverErrors)
      const field = definition.fields.find((candidate) => candidate.key === serverErrors[0]?.fieldKey)
      const index = steps.findIndex((item) => item.key === field?.stepKey)
      if (index >= 0) setStepIndex(index)
    }
  }
  const safeIndex = Math.min(stepIndex, Math.max(0, steps.length - 1))
  const step = steps[safeIndex]
  const isLast = safeIndex >= steps.length - 1
  const stepFields = definition.fields.filter(
    (field) => field.stepKey === step?.key && state.visible.has(field.key),
  )
  const errorFor = (key: string) => errors.find((error) => error.fieldKey === key)?.message

  const setAnswer = (key: string, value: AnswerValue) => {
    setAnswers((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => previous.filter((error) => error.fieldKey !== key))
  }

  const goNext = () => {
    if (!step) return
    const stepErrors = validateStep(definition, current, step.key)
    setErrors(stepErrors)
    if (stepErrors.length > 0) {
      requestAnimationFrame(() => errorSummary.current?.focus())
      return
    }
    if (!isLast) {
      setStepIndex(safeIndex + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    // Final step: build the payload from visible questions only.
    const payload: RendererSubmit['answers'] = {}
    const uploads: RendererSubmit['files'] = []
    for (const field of definition.fields) {
      if (!state.visible.has(field.key)) continue
      if (field.type === 'FILE') {
        for (const file of files[field.key] ?? []) uploads.push({ fieldKey: field.key, file })
        continue
      }
      const value = answers[field.key]
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue
      payload[field.key] = value as string | number | string[]
    }
    onSubmit({ answers: payload, files: uploads, ticketTypeId: ticketTypeId || undefined })
  }

  if (!step) return <Notice tone="warning">This form has no questions yet.</Notice>

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        goNext()
      }}
      className="space-y-6"
    >
      {steps.length > 1 && (
        <div>
          <p className="text-muted-foreground text-sm">
            Step {safeIndex + 1} of {steps.length}
          </p>
          <div className="mt-2 flex gap-1" aria-hidden>
            {steps.map((item, index) => (
              <div
                key={item.key}
                className={cn('h-1.5 flex-1 rounded-full', index <= safeIndex ? 'bg-primary' : 'bg-muted')}
              />
            ))}
          </div>
        </div>
      )}
      <div>
        <h2 className="text-lg font-semibold">{step.title}</h2>
        {step.description && <p className="text-muted-foreground mt-1 text-sm">{step.description}</p>}
      </div>

      {errors.length > 0 && (
        <div ref={errorSummary} tabIndex={-1} className="outline-none">
          <Notice
            tone="error"
            title={`Please fix ${errors.length === 1 ? 'one problem' : `${errors.length} problems`}`}
          >
            <ul className="list-inside list-disc">
              {errors.map((error) => (
                <li key={error.fieldKey}>
                  <a href={`#q-${error.fieldKey}`} className="underline">
                    {definition.fields.find((field) => field.key === error.fieldKey)?.label ?? error.fieldKey}
                  </a>
                  : {error.message}
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <div className="space-y-6">
        {stepFields.map((field) => (
          <Question
            key={field.key}
            field={field}
            required={state.required.has(field.key)}
            value={answers[field.key]}
            files={files[field.key] ?? []}
            error={errorFor(field.key)}
            disabled={disabled}
            onChange={(value) => setAnswer(field.key, value)}
            onFiles={(list) => {
              setFiles((previous) => ({ ...previous, [field.key]: list }))
              setErrors((previous) => previous.filter((error) => error.fieldKey !== field.key))
            }}
          />
        ))}
      </div>

      {isLast && ticketTypes.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor="ticket-type">Ticket type</Label>
          <NativeSelect
            id="ticket-type"
            value={ticketTypeId}
            onChange={(event) => setTicketTypeId(event.target.value)}
            disabled={disabled}
          >
            {ticketTypes.map((type) => (
              <option key={type.id} value={type.id} disabled={!type.available}>
                {type.name}
                {!type.available ? ' — sold out' : ''}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        {safeIndex > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStepIndex(safeIndex - 1)}
            disabled={submitting}
          >
            <ChevronLeft /> Back
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" loading={submitting} disabled={disabled}>
          {isLast ? submitLabel : 'Continue'} {!isLast && <ChevronRight />}
        </Button>
      </div>
    </form>
  )
}

function initialAnswers(
  definition: FormDefinition,
  prefill?: { name: string | null; email: string | null },
): Answers {
  const answers: Answers = {}
  for (const field of definition.fields) {
    if (field.role === 'RESPONDENT_NAME' && prefill?.name) answers[field.key] = prefill.name
    if (field.role === 'RESPONDENT_EMAIL' && prefill?.email) answers[field.key] = prefill.email
  }
  return answers
}

function Question({
  field,
  required,
  value,
  files,
  error,
  disabled,
  onChange,
  onFiles,
}: {
  field: FieldDef
  required: boolean
  value: AnswerValue
  files: File[]
  error?: string
  disabled?: boolean
  onChange: (value: AnswerValue) => void
  onFiles: (files: File[]) => void
}) {
  const id = `q-${field.key}`
  const aria = fieldAria(id, error, Boolean(field.description))
  const textValue = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  const selected = Array.isArray(value) ? (value as string[]) : []
  const rules = field.validation ?? {}
  const isGroup = field.type === 'RADIO' || field.type === 'CHECKBOX'

  const label = (
    <>
      {field.label}
      {required ? (
        <span className="text-destructive ml-0.5" aria-hidden>
          *
        </span>
      ) : (
        <span className="text-muted-foreground ml-1 text-xs font-normal">(optional)</span>
      )}
    </>
  )

  let control: React.ReactNode
  switch (field.type) {
    case 'PARAGRAPH':
      control = (
        <Textarea
          {...aria}
          value={textValue}
          placeholder={field.placeholder ?? undefined}
          maxLength={Math.min(rules.maxLength ?? LIMITS.paragraphMax, LIMITS.paragraphMax)}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          required={required}
        />
      )
      break
    case 'DROPDOWN':
      control = (
        <NativeSelect
          {...aria}
          value={textValue}
          onChange={(event) => onChange(event.target.value || null)}
          disabled={disabled}
          required={required}
        >
          <option value="">Choose…</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      )
      break
    case 'MULTI_SELECT':
      control = (
        <select
          {...aria}
          multiple
          value={selected}
          onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}
          disabled={disabled}
          className="border-input bg-card min-h-28 w-full rounded-md border p-2 text-sm"
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
      break
    case 'RADIO':
      control = (
        <div className="space-y-2">
          {field.options?.map((option) => (
            <label
              key={option.value}
              className="bg-card has-[:checked]:border-primary has-[:checked]:bg-accent flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
            >
              <input
                type="radio"
                name={id}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                disabled={disabled}
                className="accent-primary size-4"
              />
              {option.label}
            </label>
          ))}
        </div>
      )
      break
    case 'CHECKBOX':
      control = (
        <div className="space-y-2">
          {field.options?.map((option) => (
            <label
              key={option.value}
              className="bg-card has-[:checked]:border-primary has-[:checked]:bg-accent flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
            >
              <input
                type="checkbox"
                value={option.value}
                checked={selected.includes(option.value)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((item) => item !== option.value),
                  )
                }
                disabled={disabled}
                className="accent-primary size-4"
              />
              {option.label}
            </label>
          ))}
        </div>
      )
      break
    case 'FILE': {
      const maxFiles = Math.min(rules.maxFiles ?? 1, LIMITS.maxFilesPerField)
      const accept = (rules.allowedExtensions?.length ? rules.allowedExtensions : FILE_EXTENSIONS)
        .map((extension) => `.${extension}`)
        .join(',')
      control = (
        <div className="space-y-2">
          <Input
            {...aria}
            type="file"
            accept={accept}
            multiple={maxFiles > 1}
            disabled={disabled || files.length >= maxFiles}
            onChange={(event) => {
              const chosen = Array.from(event.target.files ?? [])
              onFiles([...files, ...chosen].slice(0, maxFiles))
              event.target.value = ''
            }}
          />
          <p className="text-muted-foreground text-xs">
            {accept.replaceAll(',', ', ')} · up to{' '}
            {Math.min(rules.maxFileSizeMb ?? LIMITS.maxFileSizeMb, LIMITS.maxFileSizeMb)} MB
            {maxFiles > 1 ? ` · ${maxFiles} files` : ''}
          </p>
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="bg-muted flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                >
                  <Paperclip className="size-4" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="text-muted-foreground text-xs">{formatBytes(file.size)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => onFiles(files.filter((_, position) => position !== index))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )
      break
    }
    default: {
      const inputType =
        { EMAIL: 'email', PHONE: 'tel', NUMBER: 'number', DATE: 'date' }[field.type as string] ?? 'text'
      control = (
        <Input
          {...aria}
          type={inputType}
          inputMode={field.type === 'NUMBER' ? 'decimal' : undefined}
          autoComplete={
            field.role === 'RESPONDENT_EMAIL'
              ? 'email'
              : field.role === 'RESPONDENT_NAME'
                ? 'name'
                : field.type === 'PHONE'
                  ? 'tel'
                  : undefined
          }
          value={textValue}
          placeholder={field.placeholder ?? undefined}
          min={field.type === 'NUMBER' ? rules.min : field.type === 'DATE' ? rules.minDate : undefined}
          max={field.type === 'NUMBER' ? rules.max : field.type === 'DATE' ? rules.maxDate : undefined}
          maxLength={
            field.type === 'SHORT_TEXT'
              ? Math.min(rules.maxLength ?? LIMITS.shortTextMax, LIMITS.shortTextMax)
              : undefined
          }
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          required={required}
        />
      )
    }
  }

  return (
    <div
      className="space-y-2"
      role={isGroup ? 'group' : undefined}
      aria-labelledby={isGroup ? `${id}-label` : undefined}
    >
      {isGroup ? (
        <p id={`${id}-label`} className="text-sm font-medium">
          {label}
        </p>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      {field.description && (
        <p id={`${id}-description`} className="text-muted-foreground text-xs">
          {field.description}
        </p>
      )}
      {isGroup ? <div id={id}>{control}</div> : control}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  )
}
