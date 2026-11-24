'use client'

import {
  AlignLeft,
  AtSign,
  Calendar,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Hash,
  ListChecks,
  Paperclip,
  Phone,
  Plus,
  Trash2,
  Type,
  type LucideIcon,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { FormRenderer } from '@/components/forms/form-renderer'
import { Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { FIELD_TYPES, type FieldDef, type FieldType, type FormDefinition } from '@/lib/form-engine'
import { cn } from '@/lib/utils'
import {
  FIELD_TYPE_LABELS,
  keyFromLabel,
  newField,
  removeFieldEverywhere,
  renameFieldEverywhere,
} from './model'
import { FieldCard } from './question-editor'

export const FIELD_TYPE_ICONS: Record<FieldType, LucideIcon> = {
  SHORT_TEXT: Type,
  PARAGRAPH: AlignLeft,
  EMAIL: AtSign,
  PHONE: Phone,
  NUMBER: Hash,
  DATE: Calendar,
  DROPDOWN: ChevronDown,
  RADIO: CircleDot,
  CHECKBOX: CheckSquare,
  MULTI_SELECT: ListChecks,
  FILE: Paperclip,
}

type Selection = { kind: 'field'; key: string } | { kind: 'step'; key: string } | null

interface Props {
  title: string
  description: string | null
  definition: FormDefinition
  onChange: (next: FormDefinition) => void
  /** Field keys that appear in responses already; their keys are locked so answers stay aligned. */
  lockedKeys: Set<string>
  /** Problems that stop the draft from being saved; the preview waits until they are fixed. */
  hasIssues: boolean
  /** Summary of form-level settings shown when nothing is selected. */
  settingsSummary: React.ReactNode
}

/**
 * The form builder's main workspace: question outline and question types on the left, a live
 * preview of the form in the centre, and the selected question's properties on the right.
 */
export function BuildWorkspace({
  title,
  description,
  definition,
  onChange,
  lockedKeys,
  hasIssues,
  settingsSummary,
}: Props) {
  const [selection, setSelection] = React.useState<Selection>(() =>
    definition.fields[0] ? { kind: 'field', key: definition.fields[0].key } : null,
  )
  const [activeStep, setActiveStep] = React.useState(definition.steps[0]?.key ?? '')

  const selectedField =
    selection?.kind === 'field' ? definition.fields.find((field) => field.key === selection.key) : undefined
  const selectedStep =
    selection?.kind === 'step' ? definition.steps.find((step) => step.key === selection.key) : undefined
  const targetStep = definition.steps.some((step) => step.key === activeStep)
    ? activeStep
    : (definition.steps[0]?.key ?? '')

  const setField = (key: string, patch: Partial<FieldDef>) =>
    onChange({
      ...definition,
      fields: definition.fields.map((field) => (field.key === key ? { ...field, ...patch } : field)),
    })

  const addField = (type: FieldType) => {
    const field = newField(definition, type, targetStep)
    onChange({ ...definition, fields: [...definition.fields, field] })
    setSelection({ kind: 'field', key: field.key })
  }

  const move = (key: string, direction: -1 | 1) => {
    const fields = [...definition.fields]
    const index = fields.findIndex((field) => field.key === key)
    const target = index + direction
    if (target < 0 || target >= fields.length) return
    ;[fields[index], fields[target]] = [fields[target] as FieldDef, fields[index] as FieldDef]
    onChange({ ...definition, fields })
  }

  const duplicate = (field: FieldDef) => {
    const taken = new Set(definition.fields.map((item) => item.key))
    const copy = {
      ...structuredClone(field),
      key: keyFromLabel(`${field.label} copy`, taken),
      role: null,
      label: `${field.label} (copy)`,
    }
    const index = definition.fields.findIndex((item) => item.key === field.key)
    const next = [...definition.fields]
    next.splice(index + 1, 0, copy)
    onChange({ ...definition, fields: next })
    setSelection({ kind: 'field', key: copy.key })
  }

  const addStep = () => {
    const taken = new Set(definition.steps.map((step) => step.key))
    const key = keyFromLabel(`step ${definition.steps.length + 1}`, taken, 'step')
    onChange({
      ...definition,
      steps: [...definition.steps, { key, title: `Step ${definition.steps.length + 1}`, description: null }],
    })
    setActiveStep(key)
    setSelection({ kind: 'step', key })
  }

  const removeStep = (key: string) => {
    if (definition.steps.length <= 1) return
    const fallback = definition.steps.find((step) => step.key !== key)?.key as string
    onChange({
      ...definition,
      steps: definition.steps.filter((step) => step.key !== key),
      fields: definition.fields.map((field) =>
        field.stepKey === key ? { ...field, stepKey: fallback } : field,
      ),
    })
    setSelection(null)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_340px]">
      {/* Left: outline and question types */}
      <aside
        aria-label="Questions"
        className="bg-card flex flex-col rounded-lg border lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:self-start"
      >
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <h2 className="text-[13px] font-semibold">Questions</h2>
          <span className="text-muted-foreground text-xs tabular-nums">{definition.fields.length}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {definition.steps.map((step, stepIndex) => {
            const fields = definition.fields.filter((field) => field.stepKey === step.key)
            return (
              <div key={step.key} className="mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveStep(step.key)
                    setSelection({ kind: 'step', key: step.key })
                  }}
                  className={cn(
                    'text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-medium',
                    selection?.kind === 'step' &&
                      selection.key === step.key &&
                      'text-foreground bg-secondary',
                  )}
                >
                  {definition.steps.length > 1 && <span className="tabular-nums">{stepIndex + 1}.</span>}
                  <span className="truncate">{step.title || 'Untitled step'}</span>
                </button>
                <ul className="mt-0.5 space-y-px">
                  {fields.map((field) => {
                    const Icon = FIELD_TYPE_ICONS[field.type]
                    const active = selection?.kind === 'field' && selection.key === field.key
                    return (
                      <li key={field.key}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveStep(step.key)
                            setSelection({ kind: 'field', key: field.key })
                          }}
                          aria-current={active ? 'true' : undefined}
                          className={cn(
                            'hover:bg-secondary flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]',
                            active && 'bg-brand-soft text-brand-text hover:bg-brand-soft font-medium',
                          )}
                        >
                          <Icon
                            className={cn(
                              'size-3.5 shrink-0',
                              active ? 'text-brand-text' : 'text-subtle-foreground',
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {field.label || 'Untitled question'}
                          </span>
                          {field.required && (
                            <span className="text-destructive text-xs" aria-label="required">
                              *
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                  {fields.length === 0 && (
                    <li className="text-subtle-foreground px-2 py-1.5 text-xs">No questions yet</li>
                  )}
                </ul>
              </div>
            )
          })}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground w-full justify-start"
            onClick={addStep}
          >
            <Plus /> Add step
          </Button>
        </div>
        <div className="border-t p-2">
          <p className="text-subtle-foreground px-1 pb-1.5 text-xs font-medium">
            Add to {definition.steps.find((step) => step.key === targetStep)?.title || 'this step'}
          </p>
          <div className="grid grid-cols-2 gap-1">
            {FIELD_TYPES.map((type) => {
              const Icon = FIELD_TYPE_ICONS[type]
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => addField(type)}
                  className="hover:bg-secondary hover:border-input flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1.5 text-left text-xs"
                  title={`Add a ${FIELD_TYPE_LABELS[type].toLowerCase()} question`}
                >
                  <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{FIELD_TYPE_LABELS[type].replace(' (radio)', '')}</span>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      {/* Centre: live preview */}
      <section aria-label="Live preview" className="bg-muted/50 min-w-0 rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">Live preview</h2>
          <span className="text-muted-foreground text-xs">
            Rules and validation run exactly as they will live
          </span>
        </div>
        <div className="p-4 sm:p-8">
          <div className="bg-card mx-auto max-w-[560px] rounded-lg border p-6 sm:p-8">
            <h3 className="text-xl font-semibold tracking-[-0.015em]">{title}</h3>
            {description && <p className="text-muted-foreground mt-1.5 text-sm">{description}</p>}
            <div className="mt-6">
              {hasIssues ? (
                <Notice tone="warning">Fix the problems listed above to preview the form.</Notice>
              ) : definition.fields.length === 0 ? (
                <p className="text-muted-foreground text-sm">Add a question from the panel on the left.</p>
              ) : (
                <FormRenderer
                  key={JSON.stringify(definition)}
                  definition={definition}
                  submitLabel="Submit (preview)"
                  onSubmit={() => toast.info('Preview only — nothing was submitted.')}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Right: properties */}
      <aside
        aria-label="Properties"
        className="bg-card rounded-lg border lg:col-span-2 xl:sticky xl:top-20 xl:col-span-1 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto"
      >
        {selectedField ? (
          <>
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              {React.createElement(FIELD_TYPE_ICONS[selectedField.type], {
                className: 'text-muted-foreground size-4',
                'aria-hidden': true,
              })}
              <h2 className="text-[13px] font-semibold">Question properties</h2>
            </div>
            <div className="p-4">
              <FieldCard
                key={selectedField.key}
                field={selectedField}
                definition={definition}
                locked={lockedKeys.has(selectedField.key)}
                onChange={(patch) => setField(selectedField.key, patch)}
                onRename={(to) => {
                  onChange(renameFieldEverywhere(definition, selectedField.key, to))
                  setSelection({ kind: 'field', key: to })
                }}
                onRemove={() => {
                  onChange(removeFieldEverywhere(definition, selectedField.key))
                  setSelection(null)
                }}
                onDuplicate={() => duplicate(selectedField)}
                onMove={(direction) => move(selectedField.key, direction)}
              />
            </div>
          </>
        ) : selectedStep ? (
          <>
            <div className="border-b px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">Step properties</h2>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="step-title">Title</Label>
                <Input
                  id="step-title"
                  value={selectedStep.title}
                  maxLength={120}
                  onChange={(event) =>
                    onChange({
                      ...definition,
                      steps: definition.steps.map((step) =>
                        step.key === selectedStep.key ? { ...step, title: event.target.value } : step,
                      ),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="step-description">Description</Label>
                <Textarea
                  id="step-description"
                  className="min-h-16"
                  value={selectedStep.description ?? ''}
                  maxLength={500}
                  onChange={(event) =>
                    onChange({
                      ...definition,
                      steps: definition.steps.map((step) =>
                        step.key === selectedStep.key
                          ? { ...step, description: event.target.value || null }
                          : step,
                      ),
                    })
                  }
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Multi-step forms show one step at a time. Steps with no visible questions are skipped.
              </p>
              {definition.steps.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => removeStep(selectedStep.key)}
                >
                  <Trash2 /> Remove step
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="border-b px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">Form</h2>
            </div>
            <div className="p-4">
              <p className="text-muted-foreground mb-4 text-[13px]">
                Select a question to edit it, or add one on the left.
              </p>
              {settingsSummary}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
