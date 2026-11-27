import { z } from 'zod'

export const guestInformation = z
  .object({
    doorsBeforeMinutes: z.number().int().min(0).max(1440).nullable().default(null),
    minimumAge: z.number().int().min(0).max(100).nullable().default(null),
    accessibility: z.string().trim().max(1500).default(''),
    parking: z.string().trim().max(1000).default(''),
    faqs: z
      .array(
        z
          .object({
            question: z.string().trim().min(1).max(160),
            answer: z.string().trim().min(1).max(1500),
          })
          .strict(),
      )
      .max(12)
      .default([]),
  })
  .strict()

export function presentGuestInformation(value: unknown, mode: string) {
  const data = guestInformation.parse(value ?? {})
  return mode === 'VIRTUAL' ? { ...data, doorsBeforeMinutes: null, parking: '' } : data
}
