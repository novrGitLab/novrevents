import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { badRequest, payloadTooLarge, validationError } from '../../lib/errors.js'
import { idParams, OK, okSchema, pageOf, paginated, responses, secured } from '../../lib/http.js'
import { MAX_DOCUMENT_BYTES } from '../../lib/uploads.js'
import { requireAuth, requireVerified } from '../../middleware/auth.js'
import { limits } from '../../plugins/rate-limit.js'
import { getSettings } from '../admin/settings.service.js'
import type { FormDefinition } from './engine/index.js'
import {
  createFormBody,
  definitionInput,
  formDetailSchema,
  formListQuery,
  formStartBody,
  formSummarySchema,
  formVersionSchema,
  publicFormSchema,
  submissionBody,
  submissionResultSchema,
  updateFormBody,
} from './form.schemas.js'
import * as service from './form.service.js'
import * as publicService from './public-form.service.js'

const slugParams = z.object({ slug: z.string().trim().min(1).max(80) })

export const formRoutes: FastifyPluginAsyncZod = async (app) => {
  // ─── Builder ───────────────────────────────────────────────────────────────

  app.get(
    '/forms',
    {
      schema: {
        tags: ['Forms'],
        summary: 'List forms you can manage',
        description:
          'Includes your own forms, forms of events you manage, and forms of organizations you administer.',
        ...secured,
        querystring: formListQuery,
        response: responses({ 200: paginated(formSummarySchema) }),
      },
    },
    async (request) => {
      const result = await service.listForms(requireAuth(request).userId, request.query)
      return pageOf(result.items, result.total, request.query.page, request.query.pageSize)
    },
  )

  app.post(
    '/forms',
    {
      schema: {
        tags: ['Forms'],
        summary: 'Create a form',
        description:
          'Creates a draft form, standalone or attached to an event. Every purpose uses the same form ' +
          'engine; the purpose only chooses the starting questions and defaults. A REGISTRATION form must ' +
          'be attached to an event and becomes that event’s registration form.',
        ...secured,
        body: createFormBody,
        response: responses({ 201: formDetailSchema }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request)
      const form = await service.createForm(auth.userId, request.body)
      await audit(request, {
        action: 'form.create',
        targetType: 'form',
        targetId: form.id,
        eventId: form.eventId,
        metadata: { purpose: form.purpose },
      })
      return reply.status(201).send(form)
    },
  )

  app.get(
    '/forms/:id',
    {
      schema: {
        tags: ['Forms'],
        summary: 'Get a form for the builder',
        ...secured,
        params: idParams,
        response: responses({ 200: formDetailSchema }),
      },
    },
    async (request) => service.getForm(requireAuth(request).userId, request.params.id),
  )

  app.patch(
    '/forms/:id',
    {
      schema: {
        tags: ['Forms'],
        summary: 'Update form settings and operational rules',
        description:
          'Closing date, response limit (counts qualifying responses), duplicate rule, automatic acceptance, ' +
          'confirmation message and data retention. These take effect immediately and do not create a new version.',
        ...secured,
        params: idParams,
        body: updateFormBody,
        response: responses({ 200: formDetailSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const form = await service.updateFormSettings(auth.userId, request.params.id, request.body)
      await audit(request, {
        action: 'form.settings_update',
        targetType: 'form',
        targetId: form.id,
        eventId: form.eventId,
        metadata: { fields: Object.keys(request.body) },
      })
      return form
    },
  )

  app.put(
    '/forms/:id/draft',
    {
      schema: {
        tags: ['Forms'],
        summary: 'Save the draft definition (steps, questions and rules)',
        description:
          'Replaces the working copy. Published versions are immutable: saving after a publish starts a new ' +
          'draft version, and existing responses keep the version they answered.',
        ...secured,
        params: idParams,
        body: definitionInput,
        response: responses({ 200: formDetailSchema }),
      },
    },
    async (request) =>
      service.saveDraft(
        requireAuth(request).userId,
        request.params.id,
        request.body as FormDefinition,
      ),
  )

  app.post(
    '/forms/:id/publish',
    {
      schema: {
        tags: ['Forms'],
        summary: 'Publish the form',
        description:
          'Makes the draft live at the form’s stable public URL. Returns 422 `FORM_INCOMPLETE` with the problems found.',
        ...secured,
        params: idParams,
        response: responses({ 200: formDetailSchema }),
      },
    },
    async (request) => {
      const settings = await getSettings()
      const auth = settings.requireVerifiedEmailToPublish
        ? requireVerified(request)
        : requireAuth(request)
      const form = await service.publishForm(auth.userId, request.params.id)
      await audit(request, {
        action: 'form.publish',
        targetType: 'form',
        targetId: form.id,
        eventId: form.eventId,
        metadata: { version: form.publishedVersion },
      })
      return form
    },
  )

  app.post(
    '/forms/:id/unpublish',
    {
      schema: {
        tags: ['Forms'],
        summary: 'Unpublish the form',
        description:
          'Stops accepting responses. The public URL stays valid and explains that the form is unavailable.',
        ...secured,
        params: idParams,
        response: responses({ 200: formDetailSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const form = await service.unpublishForm(auth.userId, request.params.id)
      await audit(request, {
        action: 'form.unpublish',
        targetType: 'form',
        targetId: form.id,
        eventId: form.eventId,
      })
      return form
    },
  )

  app.post(
    '/forms/:id/duplicate',
    {
      schema: {
        tags: ['Forms'],
        summary: 'Duplicate a form',
        description:
          'Copies questions, rules and settings into a new draft. Responses are not copied.',
        ...secured,
        params: idParams,
        response: responses({ 201: formDetailSchema }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request)
      const form = await service.duplicateForm(auth.userId, request.params.id)
      await audit(request, {
        action: 'form.duplicate',
        targetType: 'form',
        targetId: form.id,
        eventId: form.eventId,
        metadata: { sourceFormId: request.params.id },
      })
      return reply.status(201).send(form)
    },
  )

  app.get(
    '/forms/:id/versions',
    {
      schema: {
        tags: ['Forms'],
        summary: 'List the versions of a form',
        ...secured,
        params: idParams,
        response: responses({ 200: z.object({ items: z.array(formVersionSchema) }) }),
      },
    },
    async (request) => ({
      items: await service.listVersions(requireAuth(request).userId, request.params.id),
    }),
  )

  app.delete(
    '/forms/:id',
    {
      schema: {
        tags: ['Forms'],
        summary: 'Delete a form and its responses',
        description: 'Not allowed for a registration form that has produced registrations.',
        ...secured,
        params: idParams,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const result = await service.deleteForm(auth.userId, request.params.id)
      await audit(request, {
        action: 'form.delete',
        targetType: 'form',
        targetId: request.params.id,
        metadata: { deletedResponses: result.deletedResponses },
      })
      return OK
    },
  )

  // ─── Public ────────────────────────────────────────────────────────────────

  app.get(
    '/public/forms/:slug',
    {
      schema: {
        tags: ['Public Forms'],
        summary: 'Get a published form for rendering',
        description:
          'No account is needed. Returns the questions and the SHOW/REQUIRE rules for conditional logic. ' +
          'Exclusion rules are never included.',
        params: slugParams,
        response: responses({ 200: publicFormSchema }),
      },
    },
    async (request) =>
      publicService.getPublicForm(request.params.slug, request.auth?.userId ?? null),
  )

  app.post(
    '/public/forms/:slug/events',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Record that a form was viewed or started',
        description: 'Anonymous funnel beacon, de-duplicated per page load by `sessionKey`.',
        params: slugParams,
        body: formStartBody.extend({ type: z.enum(['view', 'start']) }),
        response: responses({ 200: okSchema }),
      },
      config: { rateLimit: limits.beacon },
    },
    async (request) => {
      await publicService.recordFormEvent(
        request.params.slug,
        request.body.type,
        request.body.sessionKey,
        {
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
        },
      )
      return OK
    },
  )

  app.post(
    '/public/forms/:slug/submissions',
    {
      schema: {
        tags: ['Public Forms'],
        summary: 'Submit a response (guests welcome)',
        description:
          'Stores the response and returns a neutral acknowledgement. `status: RECEIVED` means the response ' +
          'was stored — acceptance is only stated when it is true. Errors: 400 `VALIDATION_ERROR`, 409 ' +
          '`FORM_CLOSED` / `FORM_FULL` / `EVENT_FULL` / `DUPLICATE_SUBMISSION` / `FORM_UPDATED`. ' +
          'Use the `/upload` variant when the form has file questions.',
        params: slugParams,
        body: submissionBody,
        response: responses({ 201: submissionResultSchema }),
      },
      config: { rateLimit: limits.publicForm },
    },
    async (request, reply) => {
      const result = await publicService.submitForm(
        request.params.slug,
        { ...request.body, files: [] },
        {
          userId: request.auth?.userId ?? null,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
        },
      )
      return reply.status(201).send(result)
    },
  )

  app.post(
    '/public/forms/:slug/submissions/upload',
    {
      schema: {
        tags: ['Public Forms'],
        summary: 'Submit a response with file uploads',
        description:
          'multipart/form-data. The `payload` text part holds the same JSON as the plain submission ' +
          'endpoint; each file is a part named `file:<questionKey>`. Files are checked by content, not by ' +
          'name, and stored privately.',
        consumes: ['multipart/form-data'],
        params: slugParams,
        response: responses({ 201: submissionResultSchema }),
      },
      config: { rateLimit: limits.publicForm },
    },
    async (request, reply) => {
      if (!request.isMultipart()) throw badRequest('Send this request as multipart/form-data.')
      let payload: unknown
      const files: publicService.UploadedFormFile[] = []
      for await (const part of request.parts({
        limits: { fileSize: MAX_DOCUMENT_BYTES, files: 10, fields: 2 },
      })) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer()
          if (part.file.truncated) throw payloadTooLarge('Each file must be 10 MB or smaller.')
          if (!part.fieldname.startsWith('file:'))
            throw badRequest('File parts must be named file:<questionKey>.')
          files.push({ fieldKey: part.fieldname.slice(5), filename: part.filename, buffer })
        } else if (part.fieldname === 'payload' && typeof part.value === 'string') {
          try {
            payload = JSON.parse(part.value)
          } catch {
            throw badRequest('The payload part must contain valid JSON.')
          }
        }
      }
      const parsed = submissionBody.safeParse(payload)
      if (!parsed.success) {
        throw validationError(
          parsed.error.issues.map((issue) => ({
            path: `body.${issue.path.join('.')}`,
            message: issue.message,
          })),
        )
      }
      const result = await publicService.submitForm(
        request.params.slug,
        { ...parsed.data, files },
        {
          userId: request.auth?.userId ?? null,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
        },
      )
      return reply.status(201).send(result)
    },
  )
}
