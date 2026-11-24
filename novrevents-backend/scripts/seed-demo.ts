// LOCAL DEMO DATA — development only.
//
//   npm run db:seed:demo              create the demo data (does nothing if it already exists)
//   npm run db:seed:demo -- --refresh  delete ONLY the demo accounts' data and recreate it with fresh dates
//
// Refuses to run unless NODE_ENV=development and the database host is local. Every account it creates
// uses the reserved domain novr-demo.example.test; guests use attendee.example.test. It never reads,
// changes or deletes any other account or record. Dates are relative to the moment it runs.
//
// Records are created through the real services (forms engine, registration, check-in, certificates),
// so capacity counters, tickets, QR codes and metrics are genuine. Only timestamps are moved into the
// past afterwards so the trends look like a real sign-up period.
import { randomUUID } from 'node:crypto'
import { env } from '../src/config/env.js'
import { hashPassword } from '../src/lib/crypto.js'
import { slugify } from '../src/lib/slug.js'
import { prisma } from '../src/lib/db.js'
import { scanTicket, manualCheckIn } from '../src/modules/attendance/attendance.service.js'
import { issueCertificates } from '../src/modules/certificates/certificate.service.js'
import { configureReminder } from '../src/modules/communications/communication.service.js'
import { saveEvent } from '../src/modules/events/discovery.service.js'
import { createEvent, publishEvent, setEventImage } from '../src/modules/events/event.service.js'
import { follow } from '../src/modules/follows/follow.service.js'
import type { FieldDef, FormDefinition, RuleDef } from '../src/modules/forms/engine/index.js'
import {
  createForm,
  publishForm,
  saveDraft,
  updateFormSettings,
} from '../src/modules/forms/form.service.js'
import { submitForm } from '../src/modules/forms/public-form.service.js'
import { createOrganization } from '../src/modules/organizations/organization.service.js'
import { approveRegistration } from '../src/modules/registrations/registration.service.js'
import { createTicketType } from '../src/modules/registrations/attendee.service.js'
import { createSession, createSpeaker } from '../src/modules/schedules/schedule.service.js'
import { decideSubmission } from '../src/modules/submissions/submission.service.js'
import { addStandardChecklist, createTask } from '../src/modules/tasks/task.service.js'
import { addTeamMember } from '../src/modules/tasks/team.service.js'
import { ticketQrPayload } from '../src/modules/tickets/ticket-credential.js'
import { renderArtwork, type ArtworkKey } from './demo/artwork.js'

// ─── Safety ──────────────────────────────────────────────────────────────────

const host = new URL(env.DATABASE_URL).hostname
if (env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', 'postgres'].includes(host)) {
  console.error(
    'Refusing to seed: demo data only runs with NODE_ENV=development against a local database.',
  )
  process.exit(1)
}
if (env.EMAIL_DRIVER !== 'log') {
  console.error('Refusing to seed: set EMAIL_DRIVER=log so no demo email leaves this machine.')
  process.exit(1)
}

const DOMAIN = 'novr-demo.example.test'
const GUEST_DOMAIN = 'attendee.example.test'
const PASSWORD = 'NovrDemo-2026!'
const refresh = process.argv.includes('--refresh')

// ─── Deterministic helpers ───────────────────────────────────────────────────

let seed = 20261115
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!
const DAY = 86_400_000
const HOUR = 3_600_000

/** A wall-clock time in a fixed-offset zone, `days` from today. Lagos is UTC+1, Nairobi UTC+3. */
function at(days: number, hour: number, minute = 0, utcOffset = 1): Date {
  const now = new Date()
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + days,
      hour - utcOffset,
      minute,
    ),
  )
}

/** A time between `from` and `to`, weighted toward `to` (sign-ups pick up close to the event). */
function weightedBetween(from: Date, to: Date): Date {
  const share = Math.sqrt(rand())
  return new Date(from.getTime() + share * (to.getTime() - from.getTime()))
}

// ─── People ──────────────────────────────────────────────────────────────────

interface Person {
  key: string
  email: string
  username: string
  displayName: string
  headline: string
  bio: string
  social?: Record<string, string>
  admin?: boolean
}

const PEOPLE: Person[] = [
  {
    key: 'amara',
    email: `organizer@${DOMAIN}`,
    username: 'amara-okafor',
    displayName: 'Amara Okafor',
    headline: 'Community programmes lead',
    bio: 'Runs security community programmes across West Africa: conferences, masterclasses and campus outreach. Fictional demo profile.',
    social: {
      website: 'https://amara.example.test',
      linkedin: 'https://www.linkedin.com/in/example',
    },
  },
  {
    key: 'tunde',
    email: `attendee@${DOMAIN}`,
    username: 'tunde-bakare',
    displayName: 'Tunde Bakare',
    headline: 'SOC analyst',
    bio: 'Detection engineering and incident response. Learning cloud security. Fictional demo profile.',
    social: { github: 'https://github.com/example' },
  },
  {
    key: 'ifeoma',
    email: `ifeoma@${DOMAIN}`,
    username: 'ifeoma-nwachukwu',
    displayName: 'Ifeoma Nwachukwu',
    headline: 'Blue team trainer',
    bio: 'Teaches hands-on detection and response. Fictional demo profile.',
  },
  {
    key: 'kelechi',
    email: `kelechi@${DOMAIN}`,
    username: 'kelechi-adeyemi',
    displayName: 'Kelechi Adeyemi',
    headline: 'CTF organiser and pentester',
    bio: 'Builds CTF challenges and runs the Flagline community. Fictional demo profile.',
  },
  {
    key: 'zainab',
    email: `zainab@${DOMAIN}`,
    username: 'zainab-bello',
    displayName: 'Zainab Bello',
    headline: 'GRC consultant',
    bio: 'Advises boards on cyber risk; mentors women entering security. Fictional demo profile.',
  },
  {
    key: 'halima',
    email: `halima@${DOMAIN}`,
    username: 'halima-yusuf',
    displayName: 'Halima Yusuf',
    headline: 'Event operations',
    bio: 'Fictional demo profile.',
  },
  {
    key: 'chidi',
    email: `chidi@${DOMAIN}`,
    username: 'chidi-eze',
    displayName: 'Chidi Eze',
    headline: 'Volunteer coordinator',
    bio: 'Fictional demo profile.',
  },
  {
    key: 'admin',
    email: `admin@${DOMAIN}`,
    username: 'novr-demo-admin',
    displayName: 'Platform Admin',
    headline: 'NOVR Events administration (demo)',
    bio: 'Development-only administrator account.',
    admin: true,
  },
]

const FIRST = [
  'Adaeze',
  'Bola',
  'Chinedu',
  'Damilola',
  'Emeka',
  'Fatima',
  'Gbenga',
  'Hauwa',
  'Ibrahim',
  'Jumoke',
  'Kunle',
  'Lola',
  'Mustapha',
  'Ngozi',
  'Obinna',
  'Precious',
  'Rukayat',
  'Segun',
  'Temitope',
  'Uche',
  'Victoria',
  'Wale',
  'Yetunde',
  'Zainab',
  'Aisha',
  'Babajide',
  'Chiamaka',
  'Dayo',
  'Efosa',
  'Folake',
  'Kwame',
  'Akosua',
  'Wanjiru',
  'Otieno',
  'Thandiwe',
  'Sipho',
  'Amina',
  'Moses',
  'Esther',
  'Samuel',
] as const
const LAST = [
  'Adebayo',
  'Okonkwo',
  'Bello',
  'Eze',
  'Ogunleye',
  'Musa',
  'Nwosu',
  'Abubakar',
  'Olawale',
  'Ibekwe',
  'Danladi',
  'Ojo',
  'Chukwu',
  'Lawal',
  'Ekpo',
  'Mensah',
  'Kamau',
  'Ndlovu',
  'Achieng',
  'Usman',
] as const
const COMPANIES = [
  'Meridian Bank',
  'Kora Fintech',
  'Lagos State Polytechnic',
  'Northgate University',
  'Savanna Telecom',
  'Baobab Health',
  'Atlas Logistics',
  'Independent consultant',
  'Harbour Insurance',
  'Delta Energy',
] as const

let guestCounter = 0
function guest() {
  guestCounter += 1
  const first = pick(FIRST)
  const last = pick(LAST)
  return {
    name: `${first} ${last}`,
    email: `${first}.${last}.${guestCounter}@${GUEST_DOMAIN}`.toLowerCase(),
    company: pick(COMPANIES),
  }
}

// ─── Existing data ───────────────────────────────────────────────────────────

const existing = await prisma.user.findMany({
  where: { email: { endsWith: `@${DOMAIN}` } },
  select: { id: true },
})
if (existing.length > 0 && !refresh) {
  console.log('Demo data already exists. Run with --refresh to rebuild it with current dates.')
  printCredentials()
  await prisma.$disconnect()
  process.exit(0)
}
if (existing.length > 0) {
  const ids = existing.map((user) => user.id)
  const events = await prisma.event.findMany({
    where: { ownerId: { in: ids } },
    select: { id: true },
  })
  const eventIds = events.map((event) => event.id)
  const forms = await prisma.form.findMany({
    where: { OR: [{ ownerId: { in: ids } }, { eventId: { in: eventIds } }] },
    select: { id: true },
  })
  const formIds = forms.map((form) => form.id)
  await prisma.$transaction(async (tx) => {
    await tx.certificate.deleteMany({ where: { eventId: { in: eventIds } } })
    await tx.registration.deleteMany({ where: { eventId: { in: eventIds } } })
    await tx.formSubmission.deleteMany({ where: { formId: { in: formIds } } })
    await tx.event.updateMany({
      where: { id: { in: eventIds } },
      data: { registrationFormId: null },
    })
    await tx.form.deleteMany({ where: { id: { in: formIds } } })
    await tx.event.deleteMany({ where: { id: { in: eventIds } } })
    await tx.organization.deleteMany({
      where: { members: { some: { userId: { in: ids }, role: 'OWNER' } } },
    })
    await tx.user.deleteMany({ where: { id: { in: ids } } })
  })
  console.log(`Removed previous demo data (${ids.length} demo accounts and their events).`)
}

// ─── Accounts ────────────────────────────────────────────────────────────────

const passwordHash = await hashPassword(PASSWORD)
const users: Record<string, string> = {}
for (const person of PEOPLE) {
  const user = await prisma.user.create({
    data: {
      email: person.email,
      passwordHash,
      role: person.admin ? 'ADMIN' : 'USER',
      emailVerifiedAt: new Date(),
      // Seeded accounts have already been through the welcome, so demo sign-ins go straight to their pages.
      onboardedAt: new Date(),
      createdAt: new Date(Date.now() - 120 * DAY),
      profile: {
        create: {
          username: person.username,
          displayName: person.displayName,
          headline: person.headline,
          bio: person.bio,
          socialLinks: person.social ?? {},
        },
      },
    },
  })
  users[person.key] = user.id
}
const id = (key: string) => users[key]!

// Follows before publishing, so followers receive real "new event" notifications.
for (const [follower, target] of [
  ['tunde', 'amara-okafor'],
  ['tunde', 'ifeoma-nwachukwu'],
  ['tunde', 'zainab-bello'],
  ['amara', 'ifeoma-nwachukwu'],
  ['amara', 'kelechi-adeyemi'],
  ['ifeoma', 'amara-okafor'],
  ['zainab', 'amara-okafor'],
  ['halima', 'amara-okafor'],
] as const) {
  await follow(id(follower), target)
}

// ─── Organisations ───────────────────────────────────────────────────────────

const org = async (
  owner: string,
  name: string,
  description: string,
  websiteUrl: string | null = null,
) => (await createOrganization(id(owner), { name, description, websiteUrl })).id

const orgs = {
  cybernovr: await org(
    'amara',
    'Cybernovr',
    'Security events and community programmes.',
    'https://cybernovr.com',
  ),
  guild: await org(
    'ifeoma',
    'Lagos Defenders Guild',
    'Practitioner-led blue team training. Fictional demo organisation.',
  ),
  flagline: await org(
    'kelechi',
    'Flagline CTF Collective',
    'Community CTFs and challenge writing. Fictional demo organisation.',
  ),
  shesecures: await org(
    'zainab',
    'SheSecures Africa',
    'Network for women in security across Africa. Fictional demo organisation.',
  ),
}

const categoryId = async (slug: string) =>
  (await prisma.eventCategory.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id

// ─── Forms ───────────────────────────────────────────────────────────────────

const STEP = 'details'
const opt = (...labels: string[]) =>
  labels.map((label) => ({
    value: label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, ''),
    label,
  }))
const field = (
  key: string,
  type: FieldDef['type'],
  label: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({
  key,
  type,
  label,
  required: false,
  stepKey: STEP,
  ...extra,
})
const NAME = field('full_name', 'SHORT_TEXT', 'Full name', {
  required: true,
  role: 'RESPONDENT_NAME',
})
const EMAIL = field('email', 'EMAIL', 'Email address', { required: true, role: 'RESPONDENT_EMAIL' })

async function buildForm(
  owner: string,
  input: {
    eventId: string
    purpose: 'REGISTRATION' | 'VOLUNTEER' | 'SPEAKER' | 'FEEDBACK'
    title: string
    description: string
  },
  definition: FormDefinition,
  settings: Parameters<typeof updateFormSettings>[2] = {},
) {
  const form = await createForm(id(owner), input)
  await saveDraft(id(owner), form.id, definition)
  if (Object.keys(settings).length) await updateFormSettings(id(owner), form.id, settings)
  await publishForm(id(owner), form.id)
  const clean = slugify(input.title, 40)
  if (!(await prisma.form.findUnique({ where: { slug: clean }, select: { id: true } })))
    await prisma.form.update({ where: { id: form.id }, data: { slug: clean } })
  return prisma.form.findUniqueOrThrow({ where: { id: form.id } })
}

const registrationDefinition = (extra: FieldDef[] = []): FormDefinition => ({
  steps: [{ key: STEP, title: 'Your details' }],
  fields: [NAME, EMAIL, field('organization', 'SHORT_TEXT', 'Organisation or school'), ...extra],
  rules: [],
})

// ─── Submissions ─────────────────────────────────────────────────────────────

let submissionCount = 0
async function submit(
  slug: string,
  answers: Record<string, unknown>,
  options: { userId?: string; ticketTypeId?: string } = {},
) {
  submissionCount += 1
  return submitForm(
    slug,
    { answers, idempotencyKey: randomUUID(), files: [], ticketTypeId: options.ticketTypeId },
    {
      userId: options.userId ?? null,
      ip: `10.20.${submissionCount % 250}.${(submissionCount * 7) % 250}`,
      userAgent: 'NOVR demo seed',
    },
  )
}

/** Moves a form's submissions and registrations into a realistic sign-up window. */
async function spreadTimestamps(formId: string, from: Date, to: Date) {
  const submissions = await prisma.formSubmission.findMany({
    where: { formId },
    select: { id: true },
  })
  const times = submissions
    .map(() => weightedBetween(from, to))
    .sort((a, b) => a.getTime() - b.getTime())
  for (const [index, submission] of submissions.entries()) {
    const time = times[index]!
    await prisma.formSubmission.update({
      where: { id: submission.id },
      data: { submittedAt: time },
    })
    const registration = await prisma.registration.findUnique({
      where: { submissionId: submission.id },
      select: { id: true },
    })
    if (registration) {
      await prisma.registration.update({
        where: { id: registration.id },
        data: { createdAt: time },
      })
      await prisma.ticket.updateMany({
        where: { registrationId: registration.id },
        data: { issuedAt: time },
      })
    }
  }
}

const REFERRERS = [
  [null, 0.34],
  ['www.linkedin.com', 0.24],
  ['www.google.com', 0.14],
  ['web.whatsapp.com', 0.13],
  ['t.co', 0.08],
  ['cybernovr.com', 0.07],
] as const
function referrer(): string | null {
  let roll = rand()
  for (const [host, share] of REFERRERS) {
    roll -= share
    if (roll <= 0) return host
  }
  return null
}

/** Page views and form funnel beacons over the promotion window, consistent with the responses. */
async function seedTraffic(
  eventId: string,
  formId: string,
  responses: number,
  from: Date,
  to: Date,
) {
  const views = Math.round(responses * (3.2 + rand() * 1.6)) + 40
  const formViews = Math.round(responses * 1.7) + 8
  const starts = Math.round(responses * 1.25) + 3
  // About seven in ten views come from distinct visitors; the rest are people coming back.
  const visitors = Array.from({ length: Math.round(views * 0.72) }, () => randomUUID())
  const visitor = () => pick(visitors)
  await prisma.analyticsEvent.createMany({
    data: [
      ...Array.from({ length: views }, () => ({
        type: 'EVENT_VIEW' as const,
        eventId,
        visitorKey: visitor(),
        referrerHost: referrer(),
        occurredAt: weightedBetween(from, to),
      })),
      ...Array.from({ length: formViews }, () => ({
        type: 'FORM_VIEW' as const,
        eventId,
        formId,
        sessionKey: randomUUID(),
        visitorKey: visitor(),
        occurredAt: weightedBetween(from, to),
      })),
      ...Array.from({ length: starts }, () => ({
        type: 'FORM_START' as const,
        eventId,
        formId,
        sessionKey: randomUUID(),
        visitorKey: visitor(),
        occurredAt: weightedBetween(from, to),
      })),
    ],
  })
}

// ─── Events ──────────────────────────────────────────────────────────────────

interface EventSpec {
  owner: string
  organizationId: string
  art: ArtworkKey
  title: string
  summary: string
  description: string
  category: string
  eventType: 'CONFERENCE' | 'WORKSHOP' | 'CTF' | 'TRAINING' | 'SUMMIT' | 'MEETUP'
  mode: 'IN_PERSON' | 'VIRTUAL' | 'HYBRID'
  startsAt: Date
  endsAt: Date
  timezone: string
  venueName?: string
  address?: string
  city?: string
  country?: string
  onlineUrl?: string
  capacity?: number
  isPaid?: boolean
  priceInfo?: string
}

async function buildEvent(spec: EventSpec) {
  const event = await createEvent(id(spec.owner), {
    title: spec.title,
    summary: spec.summary,
    description: spec.description,
    categoryId: await categoryId(spec.category),
    organizationId: spec.organizationId,
    eventType: spec.eventType,
    mode: spec.mode,
    startsAt: spec.startsAt,
    endsAt: spec.endsAt,
    timezone: spec.timezone,
    venueName: spec.venueName ?? null,
    address: spec.address ?? null,
    city: spec.city ?? null,
    country: spec.country ?? null,
    onlineUrl: spec.onlineUrl ?? null,
    capacity: spec.capacity ?? null,
    isPaid: spec.isPaid ?? false,
    priceInfo: spec.priceInfo ?? null,
    organizerEmail: `events@${DOMAIN}`,
    visibility: 'PUBLIC',
  } as Parameters<typeof createEvent>[1])
  await setEventImage(id(spec.owner), event.id, 'banner', await renderArtwork(spec.art))
  // Readable demo URLs (/events/cybernovr-security-summit-2026) when the plain slug is free.
  const clean = slugify(spec.title)
  if (!(await prisma.event.findUnique({ where: { slug: clean }, select: { id: true } })))
    await prisma.event.update({ where: { id: event.id }, data: { slug: clean } })
  return prisma.event.findUniqueOrThrow({ where: { id: event.id } })
}

async function publish(owner: string, eventId: string, publishedDaysAgo: number) {
  await publishEvent(id(owner), eventId)
  // Published weeks ago in the story; also keeps today's publishing allowance free for the live demo.
  const publishedAt = new Date(Date.now() - publishedDaysAgo * DAY)
  await prisma.event.update({ where: { id: eventId }, data: { publishedAt } })
  await prisma.notification.updateMany({
    where: {
      linkPath: {
        contains: (await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).slug,
      },
    },
    data: { createdAt: publishedAt },
  })
}

async function registerGuests(
  formSlug: string,
  count: number,
  answersFor: (person: ReturnType<typeof guest>) => Record<string, unknown>,
  ticketTypeIds?: { id: string; weight: number }[],
) {
  for (let index = 0; index < count; index += 1) {
    const person = guest()
    let ticketTypeId: string | undefined
    if (ticketTypeIds) {
      let roll = rand()
      ticketTypeId =
        ticketTypeIds.find((type) => (roll -= type.weight) <= 0)?.id ?? ticketTypeIds[0]!.id
    }
    await submit(
      formSlug,
      {
        full_name: person.name,
        email: person.email,
        organization: person.company,
        ...answersFor(person),
      },
      { ticketTypeId },
    )
  }
}

async function checkInAll(owner: string, eventId: string, share: number, day: Date) {
  const registrations = await prisma.registration.findMany({
    where: { eventId, status: 'CONFIRMED' },
    include: { ticket: true },
    orderBy: { createdAt: 'asc' },
  })
  let checked = 0
  for (const registration of registrations) {
    if (!registration.ticket || rand() > share) continue
    if (rand() < 0.85)
      await scanTicket(id(owner), eventId, ticketQrPayload(registration.ticket.code))
    else await manualCheckIn(id(owner), eventId, { registrationId: registration.id })
    const time = new Date(day.getTime() - 45 * 60_000 + rand() * 150 * 60_000)
    await prisma.checkIn.updateMany({
      where: { ticketId: registration.ticket.id },
      data: { checkedInAt: time },
    })
    checked += 1
  }
  await prisma.scanLog.updateMany({ where: { eventId }, data: { createdAt: day } })
  return checked
}

// 1 ── Cybernovr Security Summit 2026 (flagship, upcoming) ──────────────────────

const summit = await buildEvent({
  owner: 'amara',
  organizationId: orgs.cybernovr,
  art: 'summit',
  title: 'Cybernovr Security Summit 2026',
  summary: 'Two days of practitioner talks on defence, risk and the future of security in Africa.',
  description: `The Cybernovr Security Summit brings together security engineers, SOC teams, CISOs, regulators and students for two days of practical talks and workshops.

Day one focuses on detection, response and cloud defence. Day two covers governance, risk and building security teams. Both days end with open networking.

What to expect
• 20+ talks across two tracks
• Hands-on workshops (limited seats, registration required on the day)
• A careers corner with hiring teams
• Certificates of attendance for checked-in attendees`,
  category: 'general-cybersecurity',
  eventType: 'CONFERENCE',
  mode: 'IN_PERSON',
  startsAt: at(12, 9),
  endsAt: at(13, 17),
  timezone: 'Africa/Lagos',
  venueName: 'Eko Convention Hall',
  address: 'Admiralty Way, Lekki Phase 1',
  city: 'Lagos',
  country: 'Nigeria',
  capacity: 400,
})
await publish('amara', summit.id, 24)
const summitStudent = await createTicketType(id('amara'), summit.id, {
  name: 'Student',
  description: 'Valid student ID required at check-in.',
  capacity: 80,
})
const summitGeneral = await prisma.ticketType.findFirstOrThrow({
  where: { eventId: summit.id, name: 'General Admission' },
})
const summitForm = await buildForm(
  'amara',
  {
    eventId: summit.id,
    purpose: 'REGISTRATION',
    title: 'Register for the Summit',
    description: 'Free entry. Your QR ticket arrives by email.',
  },
  registrationDefinition([
    field('role', 'DROPDOWN', 'Which best describes your role?', {
      required: true,
      options: opt(
        'Security engineer',
        'SOC analyst',
        'GRC or audit',
        'Leadership',
        'Student',
        'Other',
      ),
    }),
    field('tracks', 'CHECKBOX', 'Which tracks interest you?', {
      options: opt('Detection and response', 'Cloud security', 'Governance and risk', 'Careers'),
    }),
  ]),
)
const roles = ['security_engineer', 'soc_analyst', 'grc_or_audit', 'leadership', 'student', 'other']
const tracks = ['detection_and_response', 'cloud_security', 'governance_and_risk', 'careers']
await registerGuests(
  summitForm.slug,
  146,
  () => ({ role: pick(roles), tracks: tracks.filter(() => rand() > 0.55) }),
  [
    { id: summitGeneral.id, weight: 0.8 },
    { id: summitStudent.id, weight: 0.2 },
  ],
)
await submit(
  summitForm.slug,
  {
    full_name: 'Tunde Bakare',
    email: `attendee@${DOMAIN}`,
    organization: 'Meridian Bank',
    role: 'soc_analyst',
    tracks: ['detection_and_response', 'cloud_security'],
  },
  { userId: id('tunde'), ticketTypeId: summitGeneral.id },
)
await spreadTimestamps(summitForm.id, new Date(Date.now() - 23 * DAY), new Date(Date.now() - HOUR))
await seedTraffic(summit.id, summitForm.id, 147, new Date(Date.now() - 24 * DAY), new Date())

// Agenda
const speakers = [
  ['Ngozi Okonkwo', 'CISO', 'Meridian Bank', 'Leads security for a pan-African bank.'],
  [
    'Kwame Mensah',
    'Principal detection engineer',
    'Savanna Telecom',
    'Builds detection pipelines at telecom scale.',
  ],
  [
    'Wanjiru Kamau',
    'Cloud security architect',
    'Baobab Health',
    'Secures multi-cloud health platforms.',
  ],
  [
    'Ibrahim Danladi',
    'Head of incident response',
    'Harbour Insurance',
    'Has led response to ransomware incidents across the region.',
  ],
  ['Thandiwe Ndlovu', 'Privacy counsel', 'Independent', 'Advises on data protection regulation.'],
  [
    'Segun Ogunleye',
    'Security researcher',
    'Kora Fintech',
    'Finds and fixes vulnerabilities in payment systems.',
  ],
] as const
const speakerIds: string[] = []
for (const [index, [name, title, organization, bio]] of speakers.entries()) {
  const speaker = await createSpeaker(id('amara'), summit.id, {
    name,
    title,
    organization,
    bio,
    sortOrder: index,
  })
  speakerIds.push(speaker.id)
}
const sessions: Array<[number, number, number, number, number, string, string, string, number[]]> =
  [
    [12, 9, 0, 9, 45, 'Opening keynote: Security as an enabler', 'Main hall', 'Main stage', [0]],
    [12, 10, 0, 10, 45, 'Detection engineering that scales', 'Main hall', 'Defence', [1]],
    [12, 10, 0, 10, 45, 'Locking down cloud identities', 'Room B', 'Cloud', [2]],
    [12, 11, 15, 12, 0, 'Inside a ransomware response', 'Main hall', 'Defence', [3]],
    [12, 14, 0, 16, 0, 'Workshop: Writing your first Sigma rules', 'Lab 1', 'Workshops', [1]],
    [13, 9, 30, 10, 15, 'NDPA compliance without the paperwork panic', 'Main hall', 'Risk', [4]],
    [13, 10, 30, 11, 15, 'Breaking payment APIs (responsibly)', 'Room B', 'Offence', [5]],
    [
      13,
      15,
      30,
      16,
      30,
      'Panel: Building security teams in Africa',
      'Main hall',
      'Main stage',
      [0, 3, 4],
    ],
  ]
for (const [day, h1, m1, h2, m2, title, location, track, who] of sessions) {
  await createSession(id('amara'), summit.id, {
    title,
    startsAt: at(day, h1, m1),
    endsAt: at(day, h2, m2),
    location,
    track,
    speakerIds: who.map((index) => speakerIds[index]!),
  })
}

// Team, tasks, reminder
await addTeamMember(id('amara'), summit.id, { username: 'halima-yusuf', role: 'MANAGER' })
await addTeamMember(id('amara'), summit.id, { username: 'chidi-eze', role: 'STAFF' })
await addStandardChecklist(id('amara'), summit.id)
const checklist = await prisma.task.findMany({
  where: { eventId: summit.id },
  orderBy: { sortOrder: 'asc' },
})
for (const task of checklist.slice(0, 4))
  await prisma.task.update({ where: { id: task.id }, data: { status: 'DONE' } })
for (const [title, status, assignee, dueDays] of [
  ['Confirm AV setup with the venue', 'IN_PROGRESS', 'halima', 5],
  ['Brief registration desk volunteers', 'TODO', 'chidi', 10],
  ['Print speaker name boards', 'TODO', 'halima', 9],
  ['Send final agenda to attendees', 'DONE', 'amara', -2],
] as const) {
  await createTask(id('amara'), summit.id, {
    title,
    status,
    assigneeId: id(assignee),
    dueAt: new Date(Date.now() + dueDays * DAY),
  } as Parameters<typeof createTask>[2])
}
await configureReminder(id('amara'), summit.id, 24 * 60)

// Volunteer form: 50-response limit and an exclusion rule.
const eligibility: RuleDef = {
  key: 'eligibility',
  type: 'EXCLUDE',
  name: 'Under 18 or not available on event days',
  enabled: true,
  targetFieldKeys: [],
  conditions: {
    combinator: 'OR',
    conditions: [
      { fieldKey: 'age_18', operator: 'equals', value: 'no' },
      { fieldKey: 'availability', operator: 'includes_none', value: ['during_the_event'] },
    ],
  },
}
const volunteerForm = await buildForm(
  'amara',
  {
    eventId: summit.id,
    purpose: 'VOLUNTEER',
    title: 'Volunteer at the Summit',
    description: 'Help run registration, sessions and the careers corner.',
  },
  {
    steps: [{ key: STEP, title: 'Volunteer application' }],
    fields: [
      NAME,
      EMAIL,
      field('phone', 'PHONE', 'Phone number'),
      field('age_18', 'RADIO', 'Are you 18 or older?', {
        required: true,
        options: opt('Yes', 'No'),
      }),
      field('availability', 'CHECKBOX', 'When can you help?', {
        required: true,
        options: opt('Before the event', 'During the event', 'After the event'),
      }),
      field('team', 'RADIO', 'Which team would you like to join?', {
        options: opt('Registration desk', 'Speaker support', 'Careers corner', 'Media'),
      }),
      field('experience', 'PARAGRAPH', 'Relevant experience'),
    ],
    rules: [eligibility],
  },
  { responseLimit: 50, duplicateFieldKeys: ['email'], autoAccept: true },
)
for (let index = 0; index < 23; index += 1) {
  const person = guest()
  const excluded = index % 6 === 5
  await submit(volunteerForm.slug, {
    full_name: person.name,
    email: person.email,
    phone: `+234 80${Math.floor(10_000_000 + rand() * 89_999_999)}`,
    age_18: excluded && index % 12 === 5 ? 'no' : 'yes',
    availability:
      excluded && index % 12 !== 5
        ? ['before_the_event']
        : ['before_the_event', 'during_the_event'].filter((_, i) => i === 1 || rand() > 0.5),
    team: pick(['registration_desk', 'speaker_support', 'careers_corner', 'media']),
    experience: pick([
      'Volunteered at two tech meetups.',
      'Student ambassador at my university.',
      'Ran registration for a 300-person conference.',
      '',
    ]),
  })
}
await spreadTimestamps(
  volunteerForm.id,
  new Date(Date.now() - 18 * DAY),
  new Date(Date.now() - 2 * HOUR),
)

const speakerForm = await buildForm(
  'amara',
  {
    eventId: summit.id,
    purpose: 'SPEAKER',
    title: 'Call for speakers',
    description: 'Propose a 30-minute talk or a 2-hour workshop.',
  },
  {
    steps: [{ key: STEP, title: 'Speaker application' }],
    fields: [
      NAME,
      EMAIL,
      field('talk_title', 'SHORT_TEXT', 'Proposed talk title', { required: true }),
      field('format', 'RADIO', 'Format', {
        required: true,
        options: opt('Talk (30 min)', 'Workshop (2 hours)'),
      }),
      field('abstract', 'PARAGRAPH', 'Abstract', { required: true }),
    ],
    rules: [],
  },
  { autoAccept: false },
)
const talks = [
  'Threat hunting with open-source tools',
  'Securing mobile money APIs',
  'Lessons from a cloud breach',
  'Phishing simulations that change behaviour',
  'Zero trust on a startup budget',
  'OT security in energy',
  'Building a SOC from scratch',
  'Privacy engineering for product teams',
  'Bug bounty programmes in Africa',
]
for (const talk of talks) {
  const person = guest()
  await submit(speakerForm.slug, {
    full_name: person.name,
    email: person.email,
    talk_title: talk,
    format: rand() > 0.75 ? 'workshop_2_hours' : 'talk_30_min',
    abstract: `${talk}: practical lessons, examples from real engagements and a checklist attendees can use the following week.`,
  })
}
const speakerSubs = await prisma.formSubmission.findMany({
  where: { formId: speakerForm.id },
  orderBy: { submittedAt: 'asc' },
})
for (const [index, submission] of speakerSubs.entries()) {
  if (index < 3) await decideSubmission(id('amara'), speakerForm.id, submission.id, 'ACCEPTED')
  else if (index === 3)
    await decideSubmission(id('amara'), speakerForm.id, submission.id, 'DECLINED')
}
await spreadTimestamps(
  speakerForm.id,
  new Date(Date.now() - 22 * DAY),
  new Date(Date.now() - 4 * DAY),
)

// 2 ── Blue Team Bootcamp (happening now) ───────────────────────────────────────

const bootcamp = await buildEvent({
  owner: 'ifeoma',
  organizationId: orgs.guild,
  art: 'blueTeam',
  title: 'Blue Team Bootcamp',
  summary: 'Three intensive days of detection, triage and incident response labs.',
  description: `A hands-on bootcamp for analysts who want to get faster at detection and response.

You will work through realistic alerts in a lab environment, write detections, triage incidents end to end and present a short incident report on the final day. Bring a laptop with at least 8 GB of RAM.`,
  category: 'defensive-security',
  eventType: 'TRAINING',
  mode: 'IN_PERSON',
  startsAt: at(3, 9),
  endsAt: at(5, 17),
  timezone: 'Africa/Lagos',
  venueName: 'Guild Training Centre',
  address: 'Plot 12, Aminu Kano Crescent, Wuse 2',
  city: 'Abuja',
  country: 'Nigeria',
  capacity: 60,
})
await publish('ifeoma', bootcamp.id, 30)
const bootcampForm = await buildForm(
  'ifeoma',
  {
    eventId: bootcamp.id,
    purpose: 'REGISTRATION',
    title: 'Bootcamp registration',
    description: 'Seats are limited to 60.',
  },
  registrationDefinition([
    field('experience', 'RADIO', 'Experience level', {
      required: true,
      options: opt('Under 1 year', '1–3 years', '3+ years'),
    }),
  ]),
)
await registerGuests(bootcampForm.slug, 51, () => ({
  experience: pick(['under_1_year', '1_3_years', '3_years']),
}))
await submit(
  bootcampForm.slug,
  {
    full_name: 'Tunde Bakare',
    email: `attendee@${DOMAIN}`,
    organization: 'Meridian Bank',
    experience: '1_3_years',
  },
  { userId: id('tunde') },
)
// Move it so the bootcamp started yesterday and ends tomorrow.
await prisma.event.update({
  where: { id: bootcamp.id },
  data: { startsAt: at(-1, 9), endsAt: at(1, 17) },
})
await spreadTimestamps(
  bootcampForm.id,
  new Date(Date.now() - 29 * DAY),
  new Date(Date.now() - 2 * DAY),
)
await seedTraffic(bootcamp.id, bootcampForm.id, 52, new Date(Date.now() - 30 * DAY), new Date())
await checkInAll('ifeoma', bootcamp.id, 0.74, at(-1, 9))
const tundeBootcamp = await prisma.registration.findFirstOrThrow({
  where: { eventId: bootcamp.id, userId: id('tunde') },
  include: { ticket: { include: { checkIn: true } } },
})
if (tundeBootcamp.ticket && !tundeBootcamp.ticket.checkIn) {
  await scanTicket(id('ifeoma'), bootcamp.id, ticketQrPayload(tundeBootcamp.ticket.code))
  await prisma.checkIn.updateMany({
    where: { ticketId: tundeBootcamp.ticket.id },
    data: { checkedInAt: at(-1, 8, 52) },
  })
}

// 3 ── Capture the Flag Nigeria ─────────────────────────────────────────────────

const ctf = await buildEvent({
  owner: 'kelechi',
  organizationId: orgs.flagline,
  art: 'ctf',
  title: 'Capture the Flag Nigeria',
  summary: 'A 36-hour jeopardy CTF for teams of up to four, on site in Enugu and online.',
  description: `Web, pwn, crypto, forensics and OSINT challenges written by the Flagline community, from beginner-friendly to brutal.

Teams of up to four. Play on site in Enugu (power, internet and food provided) or join online. Prizes for the top three teams and the best student team. Write-ups are published after the event.`,
  category: 'offensive-security',
  eventType: 'CTF',
  mode: 'HYBRID',
  startsAt: at(19, 10),
  endsAt: at(20, 22),
  timezone: 'Africa/Lagos',
  venueName: 'Coal City Innovation Hub',
  city: 'Enugu',
  country: 'Nigeria',
  onlineUrl: 'https://ctf.example.test',
  capacity: 240,
})
await publish('kelechi', ctf.id, 20)
const ctfForm = await buildForm(
  'kelechi',
  {
    eventId: ctf.id,
    purpose: 'REGISTRATION',
    title: 'Register your place',
    description: 'Register individually; you can form or join a team later.',
  },
  registrationDefinition([
    field('team_name', 'SHORT_TEXT', 'Team name (if you have one)'),
    field('participation', 'RADIO', 'How will you play?', {
      required: true,
      options: opt('On site in Enugu', 'Online'),
    }),
  ]),
)
await registerGuests(ctfForm.slug, 95, () => ({
  team_name:
    rand() > 0.4
      ? pick([
          'NullPointers',
          'Root Cause',
          'Byte Club',
          'Shellshockers',
          'Packet Sniffers',
          'Segfault FC',
        ])
      : '',
  participation: rand() > 0.45 ? 'on_site_in_enugu' : 'online',
}))
await submit(
  ctfForm.slug,
  {
    full_name: 'Tunde Bakare',
    email: `attendee@${DOMAIN}`,
    organization: 'Meridian Bank',
    team_name: 'Root Cause',
    participation: 'online',
  },
  { userId: id('tunde') },
)
await spreadTimestamps(ctfForm.id, new Date(Date.now() - 19 * DAY), new Date(Date.now() - 3 * HOUR))
await seedTraffic(ctf.id, ctfForm.id, 96, new Date(Date.now() - 20 * DAY), new Date())

// 4 ── Cloud Security Masterclass (online) ─────────────────────────────────────

const cloud = await buildEvent({
  owner: 'amara',
  organizationId: orgs.cybernovr,
  art: 'cloud',
  title: 'Cloud Security Masterclass',
  summary: 'A live online masterclass on identity, posture management and workload security.',
  description: `Three focused hours on the cloud controls that prevent most real incidents: identity and access, misconfiguration and workload protection.

Live demos on AWS and Azure, a posture checklist you can take back to work, and open Q&A. The joining link is shared with registered attendees.`,
  category: 'cloud-security',
  eventType: 'TRAINING',
  mode: 'VIRTUAL',
  startsAt: at(8, 14),
  endsAt: at(8, 17),
  timezone: 'Africa/Lagos',
  onlineUrl: 'https://meet.example.test/cloud-masterclass',
})
await publish('amara', cloud.id, 16)
const cloudForm = await buildForm(
  'amara',
  {
    eventId: cloud.id,
    purpose: 'REGISTRATION',
    title: 'Join the masterclass',
    description: 'You will receive the joining link by email.',
  },
  registrationDefinition([
    field('cloud', 'CHECKBOX', 'Which clouds do you use?', {
      options: opt('AWS', 'Azure', 'Google Cloud', 'None yet'),
    }),
  ]),
)
await registerGuests(cloudForm.slug, 178, () => ({
  cloud: ['aws', 'azure', 'google_cloud'].filter(() => rand() > 0.5),
}))
await spreadTimestamps(cloudForm.id, new Date(Date.now() - 15 * DAY), new Date(Date.now() - HOUR))
await seedTraffic(cloud.id, cloudForm.id, 178, new Date(Date.now() - 16 * DAY), new Date())

// 5 ── Women in Cybersecurity Africa (approval required, Nairobi time) ─────────

const wica = await buildEvent({
  owner: 'zainab',
  organizationId: orgs.shesecures,
  art: 'wica',
  title: 'Women in Cybersecurity Africa',
  summary: 'Leadership, careers and community for women in security, in Nairobi and online.',
  description: `A day of talks, mentoring circles and career clinics for women at every stage of a security career, from students to CISOs.

Places in the room are limited, so in-person registrations are reviewed. Online attendance is open to everyone.`,
  category: 'careers-community',
  eventType: 'CONFERENCE',
  mode: 'HYBRID',
  startsAt: at(26, 9, 0, 3),
  endsAt: at(26, 17, 0, 3),
  timezone: 'Africa/Nairobi',
  venueName: 'Riverside Conference Centre',
  city: 'Nairobi',
  country: 'Kenya',
  onlineUrl: 'https://meet.example.test/wica',
  capacity: 150,
})
await publish('zainab', wica.id, 14)
const wicaForm = await buildForm(
  'zainab',
  {
    eventId: wica.id,
    purpose: 'REGISTRATION',
    title: 'Request a place',
    description: 'In-person places are reviewed by the organisers.',
  },
  registrationDefinition([
    field('career_stage', 'DROPDOWN', 'Career stage', {
      required: true,
      options: opt('Student', 'Early career', 'Mid career', 'Senior or leadership'),
    }),
  ]),
  { autoAccept: false },
)
await registerGuests(wicaForm.slug, 74, () => ({
  career_stage: pick(['student', 'early_career', 'mid_career', 'senior_or_leadership']),
}))
const pending = await prisma.registration.findMany({
  where: { eventId: wica.id, status: 'PENDING' },
  orderBy: { createdAt: 'asc' },
})
for (const registration of pending.slice(0, 58))
  await approveRegistration(registration.id, id('zainab'))
await spreadTimestamps(wicaForm.id, new Date(Date.now() - 13 * DAY), new Date(Date.now() - HOUR))
await seedTraffic(wica.id, wicaForm.id, 74, new Date(Date.now() - 14 * DAY), new Date())

// 6 ── Cyber Risk & GRC Forum (paid) ───────────────────────────────────────────

const grc = await buildEvent({
  owner: 'amara',
  organizationId: orgs.cybernovr,
  art: 'grc',
  title: 'Cyber Risk & GRC Forum',
  summary: 'Board members, regulators and risk owners on making cyber risk measurable.',
  description: `A one-day forum on cyber risk governance: quantifying risk for boards, preparing for regulatory examinations and running third-party risk programmes that scale.

Sessions are held under the Chatham House rule. Lunch is included.`,
  category: 'governance-risk-compliance',
  eventType: 'CONFERENCE',
  mode: 'IN_PERSON',
  startsAt: at(33, 9),
  endsAt: at(33, 16),
  timezone: 'Africa/Lagos',
  venueName: 'Transcorp Conference Centre',
  city: 'Abuja',
  country: 'Nigeria',
  capacity: 120,
  isPaid: true,
  priceInfo: '₦45,000 per delegate. An invoice is sent after registration.',
})
await publish('amara', grc.id, 10)
const grcForm = await buildForm(
  'amara',
  {
    eventId: grc.id,
    purpose: 'REGISTRATION',
    title: 'Delegate registration',
    description: 'An invoice is sent to the email you provide.',
  },
  registrationDefinition([field('job_title', 'SHORT_TEXT', 'Job title', { required: true })]),
)
await registerGuests(grcForm.slug, 41, () => ({
  job_title: pick([
    'Chief Risk Officer',
    'Head of Compliance',
    'Internal Auditor',
    'Board Member',
    'CISO',
    'Risk Analyst',
  ]),
}))
await spreadTimestamps(grcForm.id, new Date(Date.now() - 9 * DAY), new Date(Date.now() - 5 * HOUR))
await seedTraffic(grc.id, grcForm.id, 41, new Date(Date.now() - 10 * DAY), new Date())

// 7 ── Offensive Security Lab (nearly full) ────────────────────────────────────

const offsec = await buildEvent({
  owner: 'ifeoma',
  organizationId: orgs.guild,
  art: 'offsec',
  title: 'Offensive Security Lab',
  summary: 'A small-group, hands-on lab on web and Active Directory attack paths.',
  description: `A one-day lab for practitioners who want to understand how attackers move. Work through a deliberately vulnerable web application and Active Directory environment with an instructor.

Small group (30 seats). Bring a laptop that can run a virtual machine.`,
  category: 'offensive-security',
  eventType: 'WORKSHOP',
  mode: 'IN_PERSON',
  startsAt: at(2, 10),
  endsAt: at(2, 17),
  timezone: 'Africa/Lagos',
  venueName: 'Guild Training Centre',
  address: 'Herbert Macaulay Way, Yaba',
  city: 'Lagos',
  country: 'Nigeria',
  capacity: 30,
})
await publish('ifeoma', offsec.id, 12)
const offsecForm = await buildForm(
  'ifeoma',
  {
    eventId: offsec.id,
    purpose: 'REGISTRATION',
    title: 'Reserve a seat',
    description: '30 seats.',
  },
  registrationDefinition(),
)
await registerGuests(offsecForm.slug, 27, () => ({}))
await spreadTimestamps(
  offsecForm.id,
  new Date(Date.now() - 11 * DAY),
  new Date(Date.now() - 6 * HOUR),
)
await seedTraffic(offsec.id, offsecForm.id, 27, new Date(Date.now() - 12 * DAY), new Date())

// 8 ── Campus Cyber Defence Day (completed, with attendance and certificates) ──

const campus = await buildEvent({
  owner: 'amara',
  organizationId: orgs.cybernovr,
  art: 'campus',
  title: 'Campus Cyber Defence Day',
  summary: 'Student teams defend a live network, then meet employers at the careers fair.',
  description: `Student teams from universities in the region defended a simulated company network against live attacks, then met security employers at the careers fair.

Thank you to every team, mentor and volunteer. Certificates of participation have been issued to everyone who checked in.`,
  category: 'awareness-education',
  eventType: 'WORKSHOP',
  mode: 'IN_PERSON',
  startsAt: at(5, 9),
  endsAt: at(5, 16),
  timezone: 'Africa/Lagos',
  venueName: 'Northgate University Main Auditorium',
  city: 'Minna',
  country: 'Nigeria',
  capacity: 150,
})
await publish('amara', campus.id, 40)
const campusForm = await buildForm(
  'amara',
  {
    eventId: campus.id,
    purpose: 'REGISTRATION',
    title: 'Student registration',
    description: 'Free for students and staff.',
  },
  registrationDefinition([
    field('level', 'DROPDOWN', 'Year of study', {
      options: opt(
        '100 level',
        '200 level',
        '300 level',
        '400 level',
        '500 level',
        'Postgraduate',
        'Staff',
      ),
    }),
  ]),
)
await registerGuests(campusForm.slug, 117, () => ({
  level: pick(['100_level', '200_level', '300_level', '400_level', '500_level', 'postgraduate']),
}))
await submit(
  campusForm.slug,
  {
    full_name: 'Tunde Bakare',
    email: `attendee@${DOMAIN}`,
    organization: 'Northgate University',
    level: 'postgraduate',
  },
  { userId: id('tunde') },
)
await checkInAll('amara', campus.id, 0.78, at(-9, 9))
const tundeCampus = await prisma.registration.findFirstOrThrow({
  where: { eventId: campus.id, userId: id('tunde') },
  include: { ticket: { include: { checkIn: true } } },
})
if (tundeCampus.ticket && !tundeCampus.ticket.checkIn) {
  await scanTicket(id('amara'), campus.id, ticketQrPayload(tundeCampus.ticket.code))
}
// A second scan of an already-used ticket, as happens at a busy door.
await scanTicket(id('amara'), campus.id, ticketQrPayload(tundeCampus.ticket!.code))
await prisma.checkIn.updateMany({
  where: { ticketId: tundeCampus.ticket!.id },
  data: { checkedInAt: at(-9, 8, 41) },
})
await prisma.scanLog.updateMany({ where: { eventId: campus.id }, data: { createdAt: at(-9, 9) } })
const feedbackForm = await buildForm(
  'amara',
  {
    eventId: campus.id,
    purpose: 'FEEDBACK',
    title: 'How was Campus Cyber Defence Day?',
    description: 'Anonymous. Two minutes.',
  },
  {
    steps: [{ key: STEP, title: 'Your feedback' }],
    fields: [
      field('rating', 'RADIO', 'Overall, how would you rate the event?', {
        required: true,
        options: opt('Excellent', 'Good', 'Fair', 'Poor'),
      }),
      field('highlight', 'DROPDOWN', 'What was most useful?', {
        options: opt('Defence exercise', 'Talks', 'Careers fair', 'Meeting other students'),
      }),
      field('comments', 'PARAGRAPH', 'What should we improve?'),
    ],
    rules: [],
  },
)
for (let index = 0; index < 43; index += 1) {
  const roll = rand()
  await submit(feedbackForm.slug, {
    rating: roll > 0.45 ? 'excellent' : roll > 0.12 ? 'good' : roll > 0.04 ? 'fair' : 'poor',
    highlight: pick([
      'defence_exercise',
      'defence_exercise',
      'talks',
      'careers_fair',
      'meeting_other_students',
    ]),
    comments: pick([
      '',
      '',
      'More time for the exercise, please.',
      'Great mentors.',
      'The Wi-Fi struggled in the afternoon.',
      'Please run it every semester.',
    ]),
  })
}
// Move the whole event into the past: it took place nine days ago. Certificates are issued after
// the move so they carry the real event date.
await prisma.event.update({
  where: { id: campus.id },
  data: { startsAt: at(-9, 9), endsAt: at(-9, 16) },
})
await issueCertificates(id('amara'), campus.id, {
  mode: 'attended',
  registrationIds: [],
  sendEmail: false,
})
await spreadTimestamps(campusForm.id, new Date(Date.now() - 40 * DAY), at(-10, 18))
await spreadTimestamps(feedbackForm.id, at(-9, 16, 30), at(-6, 12))
await prisma.certificate.updateMany({
  where: { eventId: campus.id },
  data: { issuedAt: at(-8, 11) },
})
await seedTraffic(campus.id, campusForm.id, 118, new Date(Date.now() - 40 * DAY), at(-9, 8))

// ─── Attendee extras ─────────────────────────────────────────────────────────

for (const event of [grc, wica, cloud]) await saveEvent(id('tunde'), event.slug, undefined)

await prisma.$disconnect()
console.log(`\nDemo data created: 8 events, ${submissionCount} form responses.`)
printCredentials()

function printCredentials() {
  console.log(`
Development-only demo accounts (password for all: ${PASSWORD})
  Organiser  organizer@${DOMAIN}   (Amara Okafor — owns the Summit, Masterclass, GRC Forum, Campus Day)
  Attendee   attendee@${DOMAIN}    (Tunde Bakare — tickets, follows, saved events, a certificate)
  Admin      admin@${DOMAIN}       (platform administration at /admin)
  Others     ifeoma@, kelechi@, zainab@, halima@, chidi@${DOMAIN}
Email is delivered by the local log driver only.`)
}
