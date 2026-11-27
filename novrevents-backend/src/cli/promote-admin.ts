import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { claimAdminInvitation } from '../modules/auth/admin-invitation.js'

try {
  const email = z.email().max(254).parse(process.argv[2]?.trim().toLowerCase())
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email } })
    if (user?.status === 'SUSPENDED') throw new Error('This account is suspended.')
    if (user?.role === 'ADMIN') return 'already has administrator access'
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await tx.adminAccessInvitation.upsert({
      where: { email },
      create: { email, expiresAt },
      update: { expiresAt },
    })
    if (user && (await claimAdminInvitation(tx, user.id, email))) return 'has administrator access'
    await tx.auditLog.create({
      data: {
        actorRole: 'SYSTEM',
        action: 'admin.user.invite',
        targetType: 'admin-invitation',
        targetId: email,
        metadata: { expiresAt: expiresAt.toISOString() },
      },
    })
    return 'can claim administrator access until ' + expiresAt.toISOString()
  })
  console.log(email + ' ' + result + '.')
} finally {
  await prisma.$disconnect()
}
