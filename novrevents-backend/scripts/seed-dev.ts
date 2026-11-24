// Development-only sample data. Refuses to run unless NODE_ENV=development and the database is local.
// Creates a demo organiser, a published event with a registration form, and a few guest registrations.
// Every record it creates is clearly labelled "[DEV SAMPLE]" and uses example.test addresses.
import { randomUUID } from 'node:crypto'
import { env } from '../src/config/env.js'
import { hashPassword } from '../src/lib/crypto.js'
import { prisma } from '../src/lib/db.js'

const host = new URL(env.DATABASE_URL).hostname
if (env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', 'postgres'].includes(host)) {
  console.error(
    'Refusing to seed: this script only runs with NODE_ENV=development against a local database.',
  )
  process.exit(1)
}

const EMAIL = 'organiser@example.test'
const PASSWORD = 'dev-only-password-123'

const existing = await prisma.user.findUnique({ where: { email: EMAIL } })
if (existing) {
  console.log(`Sample data already present. Sign in as ${EMAIL} / ${PASSWORD}`)
  process.exit(0)
}

const category = await prisma.eventCategory.findUniqueOrThrow({
  where: { slug: 'defensive-security' },
})
const user = await prisma.user.create({
  data: {
    email: EMAIL,
    passwordHash: await hashPassword(PASSWORD),
    emailVerifiedAt: new Date(),
    onboardedAt: new Date(),
    profile: {
      create: {
        username: 'dev-organiser',
        displayName: '[DEV SAMPLE] Organiser',
        headline: 'Sample account for local development',
      },
    },
  },
})

const startsAt = new Date(Date.now() + 21 * 86_400_000)
startsAt.setUTCHours(8, 0, 0, 0)
const event = await prisma.event.create({
  data: {
    slug: `dev-sample-blue-team-day-${randomUUID().slice(0, 5)}`,
    ownerId: user.id,
    title: '[DEV SAMPLE] Blue Team Day',
    summary: 'Sample event for local development.',
    description:
      'This event exists only in a local development database. It demonstrates registration, tickets and check-in.',
    categoryId: category.id,
    eventType: 'WORKSHOP',
    mode: 'HYBRID',
    startsAt,
    endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
    timezone: 'Africa/Lagos',
    venueName: 'Sample Venue',
    city: 'Abuja',
    country: 'Nigeria',
    onlineUrl: 'https://meet.example.test/dev-sample',
    organizerName: '[DEV SAMPLE] Organiser',
    capacity: 100,
    status: 'PUBLISHED',
    publishedAt: new Date(),
    accessKey: randomUUID(),
    ticketTypes: { create: { name: 'General Admission' } },
  },
})
console.log(`Created ${event.title}`)
console.log(
  `Sign in as ${EMAIL} / ${PASSWORD}, then add a registration form from the event dashboard.`,
)
await prisma.$disconnect()
