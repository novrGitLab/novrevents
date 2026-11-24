import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import {
  idParams,
  isoDateTime,
  OK,
  okSchema,
  optionalText,
  requiredText,
  responses,
  secured,
} from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import * as tasks from './task.service.js'
import * as team from './team.service.js'

const personSchema = z.object({
  userId: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
})

const teamMemberSchema = personSchema
  .extend({ role: z.enum(['OWNER', 'MANAGER', 'STAFF']), addedAt: z.date() })
  .meta({ id: 'EventTeamMember' })

const taskSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['TASK', 'CHECKLIST']),
    title: z.string(),
    description: z.string().nullable(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
    dueAt: z.date().nullable(),
    sortOrder: z.number().int(),
    completedAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
    assignee: personSchema.nullable(),
  })
  .meta({ id: 'Task' })

const taskBody = z.object({
  title: requiredText(2, 200),
  description: optionalText(2000),
  kind: z.enum(['TASK', 'CHECKLIST']).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
  /** Must be the event owner or a member of the event team. */
  assigneeId: z.uuid().nullable().optional(),
  dueAt: isoDateTime.nullable().optional(),
})

const teamBody = z.object({
  username: z.string().trim().toLowerCase().min(1).max(40),
  role: z.enum(['MANAGER', 'STAFF']).default('STAFF'),
})

const memberParams = z.object({ id: z.uuid(), userId: z.uuid() })
const taskParams = z.object({ id: z.uuid(), taskId: z.uuid() })

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  // ─── Team ──────────────────────────────────────────────────────────────────

  app.get(
    '/events/:id/team',
    {
      schema: {
        tags: ['Team & Tasks'],
        summary: 'List the event team',
        ...secured,
        params: idParams,
        response: responses({ 200: z.object({ items: z.array(teamMemberSchema) }) }),
      },
    },
    async (request) => ({
      items: await team.listTeam(requireAuth(request).userId, request.params.id),
    }),
  )

  app.post(
    '/events/:id/team',
    {
      schema: {
        tags: ['Team & Tasks'],
        summary: 'Add a team member by username (owner or organization admin)',
        description: 'MANAGER can run the event. STAFF can only check attendees in.',
        ...secured,
        params: idParams,
        body: teamBody,
        response: responses({ 201: z.object({ items: z.array(teamMemberSchema) }) }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request)
      const userId = await team.addTeamMember(auth.userId, request.params.id, request.body)
      await audit(request, {
        action: 'event.team_add',
        targetType: 'user',
        targetId: userId,
        eventId: request.params.id,
        metadata: { role: request.body.role },
      })
      return reply.status(201).send({ items: await team.listTeam(auth.userId, request.params.id) })
    },
  )

  app.patch(
    '/events/:id/team/:userId',
    {
      schema: {
        tags: ['Team & Tasks'],
        summary: 'Change a team member role',
        ...secured,
        params: memberParams,
        body: z.object({ role: z.enum(['MANAGER', 'STAFF']) }),
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      await team.updateTeamMember(
        auth.userId,
        request.params.id,
        request.params.userId,
        request.body.role,
      )
      await audit(request, {
        action: 'event.team_role',
        targetType: 'user',
        targetId: request.params.userId,
        eventId: request.params.id,
        metadata: { role: request.body.role },
      })
      return OK
    },
  )

  app.delete(
    '/events/:id/team/:userId',
    {
      schema: {
        tags: ['Team & Tasks'],
        summary: 'Remove a team member, or leave the team',
        ...secured,
        params: memberParams,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      await team.removeTeamMember(auth.userId, request.params.id, request.params.userId)
      await audit(request, {
        action: 'event.team_remove',
        targetType: 'user',
        targetId: request.params.userId,
        eventId: request.params.id,
      })
      return OK
    },
  )

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  app.get(
    '/events/:id/tasks',
    {
      schema: {
        tags: ['Team & Tasks'],
        summary: 'List tasks and checklist items',
        ...secured,
        params: idParams,
        querystring: z.object({
          kind: z.enum(['TASK', 'CHECKLIST']).optional(),
          status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
          assignedToMe: z.enum(['true', 'false']).optional(),
        }),
        response: responses({ 200: z.object({ items: z.array(taskSchema) }) }),
      },
    },
    async (request) => ({
      items: await tasks.listTasks(requireAuth(request).userId, request.params.id, {
        kind: request.query.kind,
        status: request.query.status,
        assignedToMe: request.query.assignedToMe === 'true',
      }),
    }),
  )

  app.post(
    '/events/:id/tasks',
    {
      schema: {
        tags: ['Team & Tasks'],
        summary: 'Create a task or checklist item',
        ...secured,
        params: idParams,
        body: taskBody,
        response: responses({ 201: taskSchema }),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await tasks.createTask(requireAuth(request).userId, request.params.id, request.body)),
  )

  app.post(
    '/events/:id/tasks/checklist',
    {
      schema: {
        tags: ['Team & Tasks'],
        summary: 'Add the standard event preparation checklist',
        description: 'Adds only the standard items the event does not already have.',
        ...secured,
        params: idParams,
        response: responses({ 201: z.object({ added: z.number().int() }) }),
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        added: await tasks.addStandardChecklist(requireAuth(request).userId, request.params.id),
      }),
  )

  app.patch(
    '/events/:id/tasks/:taskId',
    {
      schema: {
        tags: ['Team & Tasks'],
        summary: 'Update a task',
        description: 'Check-in staff can only change the status of tasks assigned to them.',
        ...secured,
        params: taskParams,
        body: taskBody.partial(),
        response: responses({ 200: taskSchema }),
      },
    },
    async (request) =>
      tasks.updateTask(
        requireAuth(request).userId,
        request.params.id,
        request.params.taskId,
        request.body,
      ),
  )

  app.delete(
    '/events/:id/tasks/:taskId',
    {
      schema: {
        tags: ['Team & Tasks'],
        summary: 'Delete a task',
        ...secured,
        params: taskParams,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      await tasks.deleteTask(requireAuth(request).userId, request.params.id, request.params.taskId)
      return OK
    },
  )
}
