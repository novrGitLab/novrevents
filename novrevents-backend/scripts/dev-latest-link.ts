// DEVELOPMENT ONLY. Prints the most recent verification (or password reset) link sent to an address, so
// browser tests can complete the real emailed flow. Refuses to run outside development, against a
// non-local database, or without the log email driver, so it can never read production mail.
//
//   npx tsx scripts/dev-latest-link.ts <email> [EMAIL_VERIFICATION|PASSWORD_RESET]
import { env } from '../src/config/env.js'
import { prisma } from '../src/lib/db.js'

const host = new URL(env.DATABASE_URL).hostname
if (env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', 'postgres'].includes(host)) {
  console.error('Refusing: this helper only runs in development against a local database.')
  process.exit(1)
}
if (env.EMAIL_DRIVER !== 'log') {
  console.error('Refusing: EMAIL_DRIVER must be "log" so no real mail is read or sent.')
  process.exit(1)
}

const [email, type = 'EMAIL_VERIFICATION'] = process.argv.slice(2)
if (!email) {
  console.error('Usage: npx tsx scripts/dev-latest-link.ts <email> [type]')
  process.exit(1)
}

const message = await prisma.message.findFirst({
  where: { toEmail: email.toLowerCase(), type: type as 'EMAIL_VERIFICATION' },
  orderBy: { createdAt: 'desc' },
  select: { bodyText: true },
})
const link = message?.bodyText.match(/https?:\/\/\S*token=[A-Za-z0-9_.-]+/)?.[0]
await prisma.$disconnect()
if (!link) {
  console.error(`No ${type} link found for ${email}`)
  process.exit(2)
}
console.log(link)
