import type { FormPurpose } from '../../generated/prisma/client.js'
import type { FieldDef, FormDefinition } from './engine/index.js'

/**
 * Starting points for each form purpose. Every purpose uses the same engine — a "speaker
 * application" or a "volunteer application" is only a pre-filled, fully editable form.
 */

const STEP = 'details'

const text = (key: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
  key,
  type: 'SHORT_TEXT',
  label,
  required: false,
  stepKey: STEP,
  ...extra,
})

const nameField = text('full_name', 'Full name', { required: true, role: 'RESPONDENT_NAME' })
const emailField: FieldDef = {
  key: 'email',
  type: 'EMAIL',
  label: 'Email address',
  required: true,
  role: 'RESPONDENT_EMAIL',
  stepKey: STEP,
}

const options = (...labels: string[]) =>
  labels.map((label) => ({
    value: label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, ''),
    label,
  }))

const FIELDS: Record<FormPurpose, FieldDef[]> = {
  REGISTRATION: [nameField, emailField, text('organization', 'Organisation or school')],
  VOLUNTEER: [
    nameField,
    emailField,
    { key: 'phone', type: 'PHONE', label: 'Phone number', required: false, stepKey: STEP },
    {
      key: 'availability',
      type: 'CHECKBOX',
      label: 'When can you help?',
      required: true,
      stepKey: STEP,
      options: options('Before the event', 'During the event', 'After the event'),
    },
    {
      key: 'experience',
      type: 'PARAGRAPH',
      label: 'Relevant experience',
      required: false,
      stepKey: STEP,
    },
  ],
  SPEAKER: [
    nameField,
    emailField,
    text('talk_title', 'Proposed talk title', { required: true }),
    { key: 'abstract', type: 'PARAGRAPH', label: 'Abstract', required: true, stepKey: STEP },
    {
      key: 'speaker_bio',
      type: 'PARAGRAPH',
      label: 'Short speaker bio',
      required: false,
      stepKey: STEP,
    },
  ],
  JUDGE: [
    nameField,
    emailField,
    text('organization', 'Organisation'),
    {
      key: 'expertise',
      type: 'PARAGRAPH',
      label: 'Areas of expertise',
      required: true,
      stepKey: STEP,
    },
  ],
  SPONSORSHIP: [
    nameField,
    emailField,
    text('company', 'Company', { required: true }),
    {
      key: 'interest',
      type: 'DROPDOWN',
      label: 'Sponsorship interest',
      required: false,
      stepKey: STEP,
      options: options(
        'Headline sponsor',
        'Supporting sponsor',
        'Community partner',
        'Not sure yet',
      ),
    },
    { key: 'message', type: 'PARAGRAPH', label: 'Message', required: false, stepKey: STEP },
  ],
  WORKSHOP: [
    nameField,
    emailField,
    {
      key: 'experience_level',
      type: 'RADIO',
      label: 'Experience level',
      required: true,
      stepKey: STEP,
      options: options('Beginner', 'Intermediate', 'Advanced'),
    },
  ],
  // Feedback is anonymous by default: no name or email question.
  FEEDBACK: [
    {
      key: 'rating',
      type: 'RADIO',
      label: 'Overall, how would you rate the event?',
      required: true,
      stepKey: STEP,
      options: options('Excellent', 'Good', 'Fair', 'Poor'),
    },
    {
      key: 'comments',
      type: 'PARAGRAPH',
      label: 'What should we improve?',
      required: false,
      stepKey: STEP,
    },
  ],
  GENERAL: [nameField, emailField],
}

const STEP_TITLES: Record<FormPurpose, string> = {
  REGISTRATION: 'Your details',
  VOLUNTEER: 'Volunteer application',
  SPEAKER: 'Speaker application',
  JUDGE: 'Judge application',
  SPONSORSHIP: 'Sponsorship inquiry',
  WORKSHOP: 'Workshop enrolment',
  FEEDBACK: 'Your feedback',
  GENERAL: 'Your details',
}

export function templateFor(purpose: FormPurpose): FormDefinition {
  return {
    steps: [{ key: STEP, title: STEP_TITLES[purpose], description: null }],
    fields: FIELDS[purpose].map((field) => ({ ...field })),
    rules: [],
  }
}

/** Default operational settings for a new form of each purpose. */
export function defaultSettingsFor(purpose: FormPurpose): {
  autoAccept: boolean
  duplicateFieldKeys: string[]
} {
  // Applications are reviewed by a person; registrations and simple forms are accepted on arrival.
  const reviewed: FormPurpose[] = ['VOLUNTEER', 'SPEAKER', 'JUDGE', 'SPONSORSHIP']
  return {
    autoAccept: !reviewed.includes(purpose),
    // One registration per email address unless the organiser changes the rule.
    duplicateFieldKeys: purpose === 'REGISTRATION' ? ['email'] : [],
  }
}
