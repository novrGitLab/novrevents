import type { EmailBlock, EmailContent } from '../../lib/email/render.js'

/** The parts of an event that appear in email. Built by `eventEmailInfo()` in the events module. */
export interface EventEmailInfo {
  title: string
  whenText: string
  whereText: string
  url: string
  organizerName: string
  accentColor?: string | null
}

const eventFacts = (event: EventEmailInfo): EmailBlock => ({
  kind: 'facts',
  rows: [
    ['Event', event.title],
    ['When', event.whenText],
    ['Where', event.whereText],
    ['Organiser', event.organizerName],
  ],
})

const greeting = (name?: string | null) => (name ? `Hi ${name},` : 'Hello,')

// ─── Account ─────────────────────────────────────────────────────────────────

export function verifyEmailContent(input: { name: string; url: string }): EmailContent {
  return {
    subject: 'Verify your email address',
    heading: 'Confirm your email address',
    blocks: [
      {
        kind: 'text',
        text: `${greeting(input.name)}\nConfirm this address to finish setting up your NOVR Events account.`,
      },
      { kind: 'button', label: 'Verify email address', url: input.url },
      {
        kind: 'note',
        text: 'This link expires in 24 hours. If you did not create an account, you can ignore this message.',
      },
    ],
    reason: 'You are receiving this because this address was used to create a NOVR Events account.',
  }
}

export function passwordResetContent(input: { name: string; url: string }): EmailContent {
  return {
    subject: 'Reset your password',
    heading: 'Reset your password',
    blocks: [
      {
        kind: 'text',
        text: `${greeting(input.name)}\nWe received a request to reset the password for your NOVR Events account.`,
      },
      { kind: 'button', label: 'Choose a new password', url: input.url },
      {
        kind: 'note',
        text: 'This link expires in 1 hour and can be used once. If you did not ask for it, no action is needed — your password has not changed.',
      },
    ],
    reason: 'You are receiving this because a password reset was requested for this address.',
  }
}

export function accountNoticeContent(input: {
  name: string
  subject: string
  message: string
}): EmailContent {
  return {
    subject: input.subject,
    heading: input.subject,
    blocks: [
      { kind: 'text', text: `${greeting(input.name)}\n${input.message}` },
      {
        kind: 'note',
        text: 'If this was not you, reset your password immediately and review your active sessions.',
      },
    ],
    reason: 'You are receiving this security notice because it concerns your NOVR Events account.',
  }
}

// ─── Forms and registration ──────────────────────────────────────────────────

/**
 * Neutral acknowledgement. It is sent for qualifying and excluded submissions alike, so it states
 * only that the response arrived and never implies acceptance.
 */
export function submissionReceiptContent(input: {
  formTitle: string
  name?: string | null
  accent?: string | null
}): EmailContent {
  return {
    subject: `We received your response: ${input.formTitle}`,
    heading: 'Your response was received',
    accent: input.accent,
    blocks: [
      {
        kind: 'text',
        text: `${greeting(input.name)}\nThank you. Your response to “${input.formTitle}” has been received.`,
      },
      {
        kind: 'note',
        text: 'This message confirms receipt only. The organiser will contact you if anything further is needed.',
      },
    ],
    reason: 'You are receiving this because this address was entered on a NOVR Events form.',
  }
}

export function registrationConfirmedContent(input: {
  event: EventEmailInfo
  attendeeName: string
  ticketCode: string
  ticketTypeName: string
  manageUrl: string
  onlineUrl?: string | null
}): EmailContent {
  const blocks: EmailBlock[] = [
    {
      kind: 'text',
      text: `${greeting(input.attendeeName)}\nYou are registered for ${input.event.title}. Your ticket is attached to this email.`,
    },
    eventFacts(input.event),
    { kind: 'facts', rows: [['Ticket', `${input.ticketTypeName} · ${input.ticketCode}`]] },
  ]
  if (input.onlineUrl) blocks.push({ kind: 'facts', rows: [['Join link', input.onlineUrl]] })
  blocks.push(
    { kind: 'button', label: 'View ticket', url: input.manageUrl },
    {
      kind: 'note',
      text: 'Show the QR code on your ticket at check-in. You can also cancel your registration from the link above. Keep this link private — anyone who has it can view your ticket.',
    },
  )
  return {
    subject: `Your ticket for ${input.event.title}`,
    heading: 'Registration confirmed',
    accent: input.event.accentColor,
    blocks,
    reason: `You are receiving this because you registered for ${input.event.title}.`,
  }
}

export function registrationPendingContent(input: {
  event: EventEmailInfo
  attendeeName: string
  manageUrl: string
}): EmailContent {
  return {
    subject: `Registration received: ${input.event.title}`,
    heading: 'Your registration is awaiting review',
    accent: input.event.accentColor,
    blocks: [
      {
        kind: 'text',
        text: `${greeting(input.attendeeName)}\nWe received your registration for ${input.event.title}. The organiser reviews registrations for this event, so it is not confirmed yet.`,
      },
      eventFacts(input.event),
      { kind: 'button', label: 'View registration status', url: input.manageUrl },
      {
        kind: 'note',
        text: 'You will get another email with your ticket if your registration is approved.',
      },
    ],
    reason: `You are receiving this because you registered for ${input.event.title}.`,
  }
}

export function registrationDeclinedContent(input: {
  event: EventEmailInfo
  attendeeName: string
}): EmailContent {
  return {
    subject: `Update on your registration: ${input.event.title}`,
    heading: 'Your registration was not approved',
    accent: input.event.accentColor,
    blocks: [
      {
        kind: 'text',
        text: `${greeting(input.attendeeName)}\nThe organiser was unable to approve your registration for ${input.event.title}. No ticket has been issued.`,
      },
      eventFacts(input.event),
    ],
    reason: `You are receiving this because you registered for ${input.event.title}.`,
  }
}

export function registrationCancelledContent(input: {
  event: EventEmailInfo
  attendeeName: string
  byOrganizer: boolean
  reason?: string | null
}): EmailContent {
  const lead = input.byOrganizer
    ? `The organiser has cancelled your registration for ${input.event.title}. Your ticket is no longer valid.`
    : `Your registration for ${input.event.title} has been cancelled, as you requested. Your ticket is no longer valid.`
  const blocks: EmailBlock[] = [{ kind: 'text', text: `${greeting(input.attendeeName)}\n${lead}` }]
  if (input.reason) blocks.push({ kind: 'facts', rows: [['Reason', input.reason]] })
  blocks.push(eventFacts(input.event), {
    kind: 'button',
    label: 'View event',
    url: input.event.url,
  })
  return {
    subject: `Registration cancelled: ${input.event.title}`,
    heading: 'Registration cancelled',
    accent: input.event.accentColor,
    blocks,
    reason: `You are receiving this because you were registered for ${input.event.title}.`,
  }
}

// ─── Event communications ────────────────────────────────────────────────────

export function eventReminderContent(input: {
  event: EventEmailInfo
  attendeeName: string
  manageUrl: string
  onlineUrl?: string | null
  note?: string | null
}): EmailContent {
  const blocks: EmailBlock[] = [
    {
      kind: 'text',
      text: `${greeting(input.attendeeName)}\nThis is a reminder that ${input.event.title} is coming up.`,
    },
    eventFacts(input.event),
  ]
  if (input.note) blocks.push({ kind: 'text', text: input.note })
  if (input.onlineUrl) blocks.push({ kind: 'facts', rows: [['Join link', input.onlineUrl]] })
  blocks.push({ kind: 'button', label: 'View ticket', url: input.manageUrl })
  return {
    subject: `Reminder: ${input.event.title}`,
    heading: 'Your event is coming up',
    accent: input.event.accentColor,
    blocks,
    reason: `You are receiving this because you are registered for ${input.event.title}.`,
  }
}

export function eventCancelledContent(input: {
  event: EventEmailInfo
  attendeeName: string
  reason?: string | null
}): EmailContent {
  const blocks: EmailBlock[] = [
    {
      kind: 'text',
      text: `${greeting(input.attendeeName)}\n${input.event.title} has been cancelled by the organiser. Your ticket is no longer valid.`,
    },
  ]
  if (input.reason)
    blocks.push({ kind: 'facts', rows: [['Message from the organiser', input.reason]] })
  blocks.push(eventFacts(input.event))
  return {
    subject: `Cancelled: ${input.event.title}`,
    heading: 'This event has been cancelled',
    accent: input.event.accentColor,
    blocks,
    reason: `You are receiving this because you were registered for ${input.event.title}.`,
  }
}

/** Organiser-written announcement or update. The body is plain text and is escaped on render. */
export function campaignContent(input: {
  event: EventEmailInfo
  subject: string
  body: string
  attendeeName?: string | null
  manageUrl?: string | null
}): EmailContent {
  const blocks: EmailBlock[] = [
    { kind: 'text', text: `${greeting(input.attendeeName)}\n${input.body}` },
    eventFacts(input.event),
  ]
  blocks.push({
    kind: 'button',
    label: input.manageUrl ? 'View ticket' : 'View event',
    url: input.manageUrl ?? input.event.url,
  })
  return {
    subject: input.subject,
    heading: input.subject,
    accent: input.event.accentColor,
    blocks,
    reason: `You are receiving this message from ${input.event.organizerName} because you are registered for ${input.event.title}.`,
  }
}

/** Speaker or volunteer invitation. It always links to an application form built with the form engine. */
export function invitationContent(input: {
  event: EventEmailInfo
  subject: string
  body: string
  formTitle: string
  formUrl: string
  role: 'speaker' | 'volunteer'
}): EmailContent {
  return {
    subject: input.subject,
    heading: input.subject,
    accent: input.event.accentColor,
    blocks: [
      { kind: 'text', text: input.body },
      eventFacts(input.event),
      {
        kind: 'button',
        label: input.role === 'speaker' ? 'Open speaker application' : 'Open volunteer application',
        url: input.formUrl,
      },
      {
        kind: 'note',
        text: `The button opens “${input.formTitle}”. You do not need an account to respond.`,
      },
    ],
    reason: `${input.event.organizerName} invited this address to take part in ${input.event.title} as a ${input.role}. If you would rather not hear from event organisers on NOVR Events, use the link below.`,
  }
}

export function certificateIssuedContent(input: {
  event: EventEmailInfo
  recipientName: string
  verifyUrl: string
  downloadUrl: string
  code: string
}): EmailContent {
  return {
    subject: `Your certificate for ${input.event.title}`,
    heading: 'Your certificate is ready',
    accent: input.event.accentColor,
    blocks: [
      {
        kind: 'text',
        text: `${greeting(input.recipientName)}\n${input.event.organizerName} has issued you a certificate for ${input.event.title}.`,
      },
      { kind: 'button', label: 'Download certificate (PDF)', url: input.downloadUrl },
      {
        kind: 'facts',
        rows: [
          ['Verification ID', input.code],
          ['Verify online', input.verifyUrl],
        ],
      },
    ],
    reason: `You are receiving this because you took part in ${input.event.title}.`,
  }
}
