import { prisma, type Prisma } from '../../lib/db.js'
import { notFound } from '../../lib/errors.js'
import type { Form } from '../../generated/prisma/client.js'
import { resolveEventRole, roleCan } from '../events/event-access.js'
import { getOrgRole, isOrgAdmin } from '../organizations/org-access.js'

/**
 * The single authorisation gate for forms and their responses.
 *
 * A user may manage a form when they:
 *  - own it, or
 *  - can manage the event it is attached to (owner, organisation admin or MANAGER — check-in staff
 *    are deliberately excluded: they never see form responses), or
 *  - are an owner/admin of the organisation workspace it belongs to.
 *
 * Everyone else gets 404, so neither the form nor its responses are disclosed.
 */
export async function requireFormAccess(userId: string, formId: string): Promise<Form> {
  const form = await prisma.form.findUnique({ where: { id: formId } })
  if (!form) throw notFound('Form')
  if (form.ownerId === userId) return form

  if (form.eventId) {
    const event = await prisma.event.findUnique({
      where: { id: form.eventId },
      select: { id: true, ownerId: true, organizationId: true },
    })
    if (event && roleCan(await resolveEventRole(userId, event), 'manage')) return form
  }
  if (form.organizationId && isOrgAdmin(await getOrgRole(userId, form.organizationId))) return form

  throw notFound('Form')
}

/** Prisma filter matching every form the user is allowed to manage. */
export function formsAccessibleBy(userId: string): Prisma.FormWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { organization: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
      {
        event: {
          OR: [
            { ownerId: userId },
            { team: { some: { userId, role: 'MANAGER' } } },
            { organization: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
          ],
        },
      },
    ],
  }
}
