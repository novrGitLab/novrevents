export const EVENT_TYPE_LABELS = {
  CONFERENCE: 'Conference',
  WORKSHOP: 'Workshop',
  CTF: 'CTF',
  MEETUP: 'Meetup',
  WEBINAR: 'Webinar',
  TRAINING: 'Training',
  HACKATHON: 'Hackathon',
  SUMMIT: 'Summit',
  PANEL: 'Panel',
  OTHER: 'Other',
} as const

export const EVENT_MODE_LABELS = {
  IN_PERSON: 'In person',
  VIRTUAL: 'Online',
  HYBRID: 'Hybrid',
} as const

export const EVENT_STATUS_LABELS = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  ONGOING: 'Ongoing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  ARCHIVED: 'Archived',
} as const

export const EVENT_STATUS_VARIANT = {
  DRAFT: 'secondary',
  PUBLISHED: 'default',
  ONGOING: 'success',
  COMPLETED: 'outline',
  CANCELLED: 'destructive',
  ARCHIVED: 'secondary',
} as const

export const VISIBILITY_LABELS = {
  PUBLIC: 'Public — listed in the directory',
  UNLISTED: 'Unlisted — anyone with the link',
  PRIVATE: 'Private — only with the private link',
} as const

export const FORM_PURPOSE_LABELS = {
  REGISTRATION: 'Event registration',
  VOLUNTEER: 'Volunteer application',
  SPEAKER: 'Speaker application',
  JUDGE: 'Judge application',
  SPONSORSHIP: 'Sponsorship inquiry',
  WORKSHOP: 'Workshop enrolment',
  FEEDBACK: 'Feedback',
  GENERAL: 'General form',
} as const

export const REGISTRATION_STATUS_VARIANT = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  DECLINED: 'destructive',
  CANCELLED: 'secondary',
} as const

export const CLOSED_REASON_TEXT: Record<string, string> = {
  NOT_PUBLISHED: 'Registration is not open yet.',
  NO_FORM: 'Registration is not open yet.',
  EVENT_CANCELLED: 'This event has been cancelled.',
  EVENT_ENDED: 'This event has ended.',
  DEADLINE_PASSED: 'The registration deadline has passed.',
  FORM_CLOSED: 'Registration has closed.',
  FULL: 'This event is full.',
}
