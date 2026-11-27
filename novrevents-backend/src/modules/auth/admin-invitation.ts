import type { Tx } from '../../lib/db.js'

export async function claimAdminInvitation(tx: Tx, userId: string, verifiedEmail: string) {
  const invitation = await tx.adminAccessInvitation.findUnique({ where: { email: verifiedEmail } })
  if (!invitation || invitation.expiresAt <= new Date()) return false
  const user = await tx.user.findFirst({
    where: { id: userId, email: verifiedEmail, status: 'ACTIVE', emailVerifiedAt: { not: null } },
    select: { id: true },
  })
  if (!user) return false
  const claim = await tx.adminAccessInvitation.deleteMany({
    where: { email: verifiedEmail, expiresAt: { gt: new Date() } },
  })
  if (!claim.count) return false
  await tx.user.update({ where: { id: userId }, data: { role: 'ADMIN' } })
  await tx.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  await tx.auditLog.create({
    data: {
      actorRole: 'SYSTEM',
      action: 'admin.user.role',
      targetType: 'user',
      targetId: userId,
      metadata: { role: 'ADMIN', via: 'verified-invitation' },
    },
  })
  return true
}
