'use client'

import { useFieldArray, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import type { EventFormValues } from './event-form'

export const guestFields = z.object({
  doorsBeforeMinutes: z.number().int().min(0).max(1440).nullable(),
  minimumAge: z.number().int().min(0).max(100).nullable(),
  accessibility: z.string().max(1500),
  parking: z.string().max(1000),
  faqs: z
    .array(
      z.object({
        question: z.string().trim().min(1, 'Enter a question.').max(160),
        answer: z.string().trim().min(1, 'Enter the answer.').max(1500),
      }),
    )
    .max(12),
})

export function GuestInformationFields({
  form,
  physical,
}: {
  form: UseFormReturn<EventFormValues>
  physical: boolean
}) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'guestInfo.faqs' })
  const errors = form.formState.errors.guestInfo
  const number = { setValueAs: (input: string) => (input === '' ? null : Number(input)) }
  return (
    <details className="guest-editor" open={errors ? true : undefined}>
      <summary>Guest information &amp; FAQs</summary>
      <div className="space-y-5 px-4 pt-2 pb-5 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {physical && (
            <Field
              label="Doors open before the start"
              htmlFor="doors-before"
              description="Minutes before the event. Use 0 if doors open at the start."
              error={errors?.doorsBeforeMinutes?.message}
            >
              <Input
                id="doors-before"
                type="number"
                min={0}
                max={1440}
                {...form.register('guestInfo.doorsBeforeMinutes', number)}
              />
            </Field>
          )}
          <Field
            label="Minimum age"
            htmlFor="minimum-age"
            description="Use 0 for all ages or leave blank to omit."
            error={errors?.minimumAge?.message}
          >
            <Input
              id="minimum-age"
              type="number"
              min={0}
              max={100}
              {...form.register('guestInfo.minimumAge', number)}
            />
          </Field>
        </div>
        <Field
          label="Accessibility information"
          htmlFor="accessibility-info"
          description={
            physical
              ? 'Describe the step-free entrance, seating or available assistance.'
              : 'Describe captions, transcripts or other ways to participate.'
          }
          error={errors?.accessibility?.message}
        >
          <Textarea id="accessibility-info" maxLength={1500} {...form.register('guestInfo.accessibility')} />
        </Field>
        {physical && (
          <Field label="Parking and transport" htmlFor="parking-info" error={errors?.parking?.message}>
            <Textarea id="parking-info" maxLength={1000} {...form.register('guestInfo.parking')} />
          </Field>
        )}
        {fields.map((field, i) => (
          <fieldset key={field.id} className="space-y-3 border-t pt-4">
            <Field
              label={'Question ' + (i + 1)}
              htmlFor={'faq-question-' + field.id}
              error={errors?.faqs?.[i]?.question?.message}
            >
              <Input
                id={'faq-question-' + field.id}
                maxLength={160}
                {...form.register(`guestInfo.faqs.${i}.question`)}
              />
            </Field>
            <Field
              label={'Answer ' + (i + 1)}
              htmlFor={'faq-answer-' + field.id}
              error={errors?.faqs?.[i]?.answer?.message}
            >
              <Textarea
                id={'faq-answer-' + field.id}
                maxLength={1500}
                {...form.register(`guestInfo.faqs.${i}.answer`)}
              />
            </Field>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => remove(i)}
              aria-label={'Remove question ' + (i + 1)}
            >
              Remove question
            </Button>
          </fieldset>
        ))}
        {fields.length < 12 && (
          <Button type="button" variant="outline" onClick={() => append({ question: '', answer: '' })}>
            Add a guest question
          </Button>
        )}
      </div>
    </details>
  )
}
