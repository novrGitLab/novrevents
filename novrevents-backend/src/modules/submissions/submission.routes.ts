import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { idParams, pageOf, paginated, paginationQuery, responses, secured } from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import * as service from './submission.service.js'

const filterQuery = z.object({
  qualification: z.enum(['ALL', 'QUALIFYING', 'EXCLUDED']).default('ALL'),
  decision: z.enum(['PENDING', 'ACCEPTED', 'DECLINED']).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(['newest', 'oldest', 'name']).default('newest'),
  fieldKey: z.string().max(40).optional(),
  fieldValue: z.string().max(200).optional(),
})

const answerSchema = z.object({
  fieldKey: z.string(),
  text: z.string().nullable(),
  number: z.number().nullable(),
  selected: z.array(z.string()).nullable(),
  files: z
    .array(z.object({ id: z.string(), name: z.string(), size: z.number(), mimeType: z.string() }))
    .nullable(),
})

const submissionSchema = z
  .object({
    id: z.uuid(),
    respondentName: z.string().nullable(),
    respondentEmail: z.string().nullable(),
    isGuest: z.boolean(),
    qualification: z.enum(['QUALIFYING', 'EXCLUDED']),
    decision: z.enum(['PENDING', 'ACCEPTED', 'DECLINED']),
    /** The exclusion rules that matched, kept for troubleshooting and transparency. */
    exclusionReasons: z.array(z.object({ key: z.string(), name: z.string().nullable() })),
    formVersion: z.number().int(),
    submittedAt: z.date(),
    decidedAt: z.date().nullable(),
    registration: z.object({ id: z.uuid(), status: z.string() }).nullable(),
    answers: z.array(answerSchema),
  })
  .meta({ id: 'Submission' })

const catalogueSchema = z.array(
  z.object({
    key: z.string(),
    label: z.string(),
    type: z.string(),
    options: z.array(z.object({ value: z.string(), label: z.string() })),
  }),
)

const statsSchema = z
  .object({
    received: z.number().int(),
    qualifying: z.number().int(),
    excluded: z.number().int(),
    accepted: z.number().int(),
    pending: z.number().int(),
    declined: z.number().int(),
    responseLimit: z.number().int().nullable(),
    remaining: z.number().int().nullable(),
    perDay: z.array(
      z.object({ date: z.string(), received: z.number().int(), qualifying: z.number().int() }),
    ),
    choices: z.array(
      z.object({
        fieldKey: z.string(),
        label: z.string(),
        options: z.array(
          z.object({ value: z.string(), label: z.string(), count: z.number().int() }),
        ),
      }),
    ),
  })
  .meta({ id: 'SubmissionStats' })

const submissionParams = z.object({ id: z.uuid(), submissionId: z.uuid() })

export const submissionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/forms/:id/submissions',
    {
      schema: {
        tags: ['Submissions'],
        summary: 'List responses',
        description:
          'Search (name, email and answer text), filter by qualification, decision, date range or a ' +
          'specific answer, and sort. `fields` lists every question across versions for column headers.',
        ...secured,
        params: idParams,
        querystring: paginationQuery.extend(filterQuery.shape),
        response: responses({
          200: paginated(submissionSchema).extend({ fields: catalogueSchema }),
        }),
      },
    },
    async (request) => {
      const result = await service.listSubmissions(
        requireAuth(request).userId,
        request.params.id,
        request.query,
      )
      return {
        ...pageOf(result.items, result.total, request.query.page, request.query.pageSize),
        fields: result.fields,
      }
    },
  )

  app.get(
    '/forms/:id/submissions/stats',
    {
      schema: {
        tags: ['Submissions'],
        summary: 'Response statistics',
        ...secured,
        params: idParams,
        response: responses({ 200: statsSchema }),
      },
    },
    async (request) => service.submissionStats(requireAuth(request).userId, request.params.id),
  )

  app.get(
    '/forms/:id/submissions/export',
    {
      schema: {
        tags: ['Submissions'],
        summary: 'Export responses as CSV',
        description:
          'Accepts the same filters as the list. Cells are protected against spreadsheet formula injection.',
        ...secured,
        params: idParams,
        querystring: filterQuery,
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request)
      const result = await service.exportSubmissionsCsv(
        auth.userId,
        request.params.id,
        request.query,
      )
      await audit(request, {
        action: 'submission.export',
        targetType: 'form',
        targetId: request.params.id,
        metadata: { rows: result.count, filters: request.query },
      })
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${result.filename}"`)
        .header('cache-control', 'no-store')
        .send(result.csv)
    },
  )

  app.get(
    '/forms/:id/submissions/:submissionId',
    {
      schema: {
        tags: ['Submissions'],
        summary: 'Get one response',
        ...secured,
        params: submissionParams,
        response: responses({ 200: submissionSchema }),
      },
    },
    async (request) =>
      service.getSubmission(
        requireAuth(request).userId,
        request.params.id,
        request.params.submissionId,
      ),
  )

  app.post(
    '/forms/:id/submissions/:submissionId/decision',
    {
      schema: {
        tags: ['Submissions'],
        summary: 'Accept or decline a response',
        description:
          'For applications and other non-registration forms. Excluded responses cannot be accepted.',
        ...secured,
        params: submissionParams,
        body: z.object({ decision: z.enum(['ACCEPTED', 'DECLINED', 'PENDING']) }),
        response: responses({ 200: submissionSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const result = await service.decideSubmission(
        auth.userId,
        request.params.id,
        request.params.submissionId,
        request.body.decision,
      )
      await audit(request, {
        action: 'submission.decision',
        targetType: 'submission',
        targetId: request.params.submissionId,
        metadata: { decision: request.body.decision },
      })
      return result
    },
  )

  app.get(
    '/forms/:id/submissions/:submissionId/files/:fileId',
    {
      schema: {
        tags: ['Submissions'],
        summary: 'Download a file attached to a response',
        description: 'Always served as a download, never rendered inline.',
        ...secured,
        params: submissionParams.extend({ fileId: z.uuid() }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request)
      const file = await service.downloadSubmissionFile(
        auth.userId,
        request.params.id,
        request.params.submissionId,
        request.params.fileId,
      )
      const asciiName = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
      void reply
        .header('content-type', file.mimeType)
        .header(
          'content-disposition',
          `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        )
        .header('x-content-type-options', 'nosniff')
        .header('cache-control', 'private, no-store')
      if (file.size !== null) void reply.header('content-length', file.size)
      return reply.send(file.stream)
    },
  )

  app.post(
    '/forms/:id/submissions/delete',
    {
      schema: {
        tags: ['Submissions'],
        summary: 'Delete responses permanently',
        ...secured,
        params: idParams,
        body: z.object({ ids: z.array(z.uuid()).min(1).max(500) }),
        response: responses({ 200: z.object({ deleted: z.number().int() }) }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const deleted = await service.deleteSubmissions(
        auth.userId,
        request.params.id,
        request.body.ids,
      )
      await audit(request, {
        action: 'submission.delete',
        targetType: 'form',
        targetId: request.params.id,
        metadata: { count: deleted, ids: request.body.ids },
      })
      return { deleted }
    },
  )
}
