import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { adminRoutes } from './modules/admin/admin.routes.js'
import { analyticsRoutes } from './modules/analytics/analytics.routes.js'
import { attendanceRoutes } from './modules/attendance/attendance.routes.js'
import { certificateRoutes } from './modules/certificates/certificate.routes.js'
import { communicationRoutes } from './modules/communications/communication.routes.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { discoveryRoutes } from './modules/events/discovery.routes.js'
import { eventRoutes } from './modules/events/event.routes.js'
import { formRoutes } from './modules/forms/form.routes.js'
import { registrationRoutes } from './modules/registrations/registration.routes.js'
import { submissionRoutes } from './modules/submissions/submission.routes.js'
import { followRoutes } from './modules/follows/follow.routes.js'
import { organizationFollowRoutes } from './modules/follows/organization-follow.routes.js'
import { notificationRoutes } from './modules/notifications/notifications.routes.js'
import { organizationRoutes } from './modules/organizations/organization.routes.js'
import { profileRoutes } from './modules/profiles/profile.routes.js'
import { scheduleRoutes } from './modules/schedules/schedule.routes.js'
import { systemRoutes } from './modules/system/system.routes.js'
import { taskRoutes } from './modules/tasks/task.routes.js'

/** Everything under `/api/v1`. Each domain module registers its own routes. */
export const apiRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(systemRoutes)
  await app.register(authRoutes)
  await app.register(profileRoutes)
  await app.register(followRoutes)
  await app.register(organizationFollowRoutes)
  await app.register(notificationRoutes)
  await app.register(organizationRoutes)
  await app.register(eventRoutes)
  await app.register(discoveryRoutes)
  await app.register(scheduleRoutes)
  await app.register(taskRoutes)
  await app.register(formRoutes)
  await app.register(submissionRoutes)
  await app.register(registrationRoutes)
  await app.register(attendanceRoutes)
  await app.register(communicationRoutes)
  await app.register(analyticsRoutes)
  await app.register(certificateRoutes)
  await app.register(adminRoutes)
}
