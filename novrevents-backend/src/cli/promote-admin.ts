// Grants the ADMIN role to an existing account: npm run admin:promote -- someone@example.com
// There is deliberately no API for creating the first administrator.
// In the production image: docker compose exec api node dist/cli/promote-admin.js <email>
import { prisma } from '../lib/db.js'

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Usage: npm run admin:promote -- <email>')
  process.exit(1)
}
const user = await prisma.user.findUnique({ where: { email } })
if (!user) {
  console.error(`No account with the email ${email}. Register it first.`)
  process.exit(1)
}
await prisma.$transaction([
  prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } }),
  prisma.auditLog.create({
    data: {
      actorRole: 'SYSTEM',
      action: 'admin.user.role',
      targetType: 'user',
      targetId: user.id,
      metadata: { role: 'ADMIN', via: 'cli' },
    },
  }),
])
console.log(`${email} is now a platform administrator.`)
await prisma.$disconnect()
