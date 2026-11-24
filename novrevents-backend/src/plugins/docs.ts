import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod'
import { env } from '../config/env.js'

export const API_TAGS = [
  { name: 'Auth', description: 'Registration, sessions, email verification and password reset.' },
  { name: 'Profiles', description: 'Simple public profiles and profile QR codes.' },
  { name: 'Follows', description: 'Following, followers and the followed-organiser feed.' },
  { name: 'Notifications', description: 'In-app notifications.' },
  { name: 'Organizations', description: 'Optional organisation workspaces and their members.' },
  { name: 'Events', description: 'Event creation, lifecycle and organiser management.' },
  { name: 'Discovery', description: 'Public event directory and event pages.' },
  { name: 'Schedule', description: 'Agenda sessions and speakers.' },
  { name: 'Team & Tasks', description: 'Event team members, tasks and the preparation checklist.' },
  { name: 'Forms', description: 'Universal form builder, versions and rules.' },
  { name: 'Public Forms', description: 'Guest-accessible form rendering and submission.' },
  { name: 'Submissions', description: 'Response management, statistics and export.' },
  { name: 'Registrations', description: 'Event registration records and attendee self-service.' },
  { name: 'Tickets', description: 'Tickets, QR credentials and downloads.' },
  { name: 'Attendance', description: 'Check-in, scanning and attendance reporting.' },
  { name: 'Communications', description: 'Campaigns, reminders, message log and preferences.' },
  { name: 'Analytics', description: 'Event and form metrics.' },
  { name: 'Certificates', description: 'Certificate templates, issuance and public verification.' },
  { name: 'Admin', description: 'Platform administration. Requires the ADMIN role.' },
  { name: 'System', description: 'Health checks and file delivery.' },
]

/**
 * Swagger is always registered so the OpenAPI document can be generated (`npm run
 * openapi:generate`); the interactive UI is only mounted when API_DOCS_ENABLED=true.
 */
export async function registerDocs(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'NOVR Events API',
        description:
          'REST API for NOVR Events, the cybersecurity event management platform by Cybernovr. ' +
          'Authentication uses an HTTP-only session cookie; state-changing requests made with a ' +
          'session must also send the `X-CSRF-Token` header returned by `GET /api/v1/auth/session`.',
        version: '1.0.0',
      },
      tags: API_TAGS,
      components: {
        securitySchemes: {
          sessionCookie: { type: 'apiKey', in: 'cookie', name: env.SESSION_COOKIE_NAME },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  })

  if (env.API_DOCS_ENABLED) {
    await app.register(swaggerUi, { routePrefix: '/docs', uiConfig: { docExpansion: 'none' } })
  }
}
