import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import {
  idParams,
  OK,
  okSchema,
  optionalText,
  requiredText,
  responses,
  secured,
} from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import { limits } from '../../plugins/rate-limit.js'
import * as service from './certificate.service.js'

const templateSchema = z
  .object({
    title: z.string(),
    body: z.string(),
    issuerName: z.string(),
    signatoryName: z.string().nullable(),
    signatoryTitle: z.string().nullable(),
    isSaved: z.boolean(),
  })
  .meta({ id: 'CertificateTemplate' })

const certificateSchema = z
  .object({
    id: z.uuid(),
    registrationId: z.uuid().nullable(),
    verificationCode: z.string(),
    recipientName: z.string(),
    recipientEmail: z.string().nullable(),
    issuedAt: z.date(),
    revokedAt: z.date().nullable(),
    revokedReason: z.string().nullable(),
    verifyUrl: z.string(),
    downloadUrl: z.string(),
  })
  .meta({ id: 'Certificate' })

const verificationSchema = z
  .object({
    verificationCode: z.string(),
    valid: z.boolean(),
    recipientName: z.string(),
    title: z.string(),
    eventName: z.string(),
    eventDateText: z.string(),
    eventSlug: z.string(),
    issuerName: z.string(),
    issuedAt: z.date(),
    revokedAt: z.date().nullable(),
  })
  .meta({ id: 'CertificateVerification' })

const codeParams = z.object({ code: z.string().trim().min(6).max(20) })

export const certificateRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/events/:id/certificates/template',
    {
      schema: {
        tags: ['Certificates'],
        summary: 'Get the certificate template',
        ...secured,
        params: idParams,
        response: responses({ 200: templateSchema }),
      },
    },
    async (request) => service.getTemplate(requireAuth(request).userId, request.params.id),
  )

  app.put(
    '/events/:id/certificates/template',
    {
      schema: {
        tags: ['Certificates'],
        summary: 'Save the certificate template',
        description:
          'The text may use {{participant_name}}, {{event_name}} and {{event_date}}; {{participant_name}} is required.',
        ...secured,
        params: idParams,
        body: z.object({
          title: requiredText(3, 80),
          body: requiredText(10, 600),
          issuerName: optionalText(120),
          signatoryName: optionalText(120),
          signatoryTitle: optionalText(120),
        }),
        response: responses({ 200: templateSchema }),
      },
    },
    async (request) =>
      service.saveTemplate(requireAuth(request).userId, request.params.id, request.body),
  )

  app.get(
    '/events/:id/certificates/preview',
    {
      schema: {
        tags: ['Certificates'],
        summary: 'Preview the certificate as a PDF with sample values',
        ...secured,
        params: idParams,
      },
    },
    async (request, reply) => {
      const pdf = await service.previewPdf(requireAuth(request).userId, request.params.id)
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', 'inline; filename="certificate-preview.pdf"')
        .send(pdf.content)
    },
  )

  app.get(
    '/events/:id/certificates',
    {
      schema: {
        tags: ['Certificates'],
        summary: 'List issued certificates',
        ...secured,
        params: idParams,
        response: responses({
          200: z.object({ items: z.array(certificateSchema), eligibleAttendees: z.number().int() }),
        }),
      },
    },
    async (request) => service.listCertificates(requireAuth(request).userId, request.params.id),
  )

  app.post(
    '/events/:id/certificates/issue',
    {
      schema: {
        tags: ['Certificates'],
        summary: 'Issue certificates',
        description:
          '`attended` issues to every checked-in attendee who does not have a certificate. `selected` issues to ' +
          'the listed confirmed registrations, whether or not they checked in (organiser authorisation).',
        ...secured,
        params: idParams,
        body: z.object({
          mode: z.enum(['attended', 'selected']),
          registrationIds: z.array(z.uuid()).max(5000).default([]),
          sendEmail: z.boolean().default(true),
        }),
        response: responses({
          200: z.object({ issued: z.number().int(), skipped: z.number().int() }),
        }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const result = await service.issueCertificates(auth.userId, request.params.id, request.body)
      await audit(request, {
        action: 'certificate.issue',
        targetType: 'event',
        targetId: request.params.id,
        eventId: request.params.id,
        metadata: { mode: request.body.mode, issued: result.issued },
      })
      return result
    },
  )

  app.post(
    '/events/:id/certificates/:certificateId/revoke',
    {
      schema: {
        tags: ['Certificates'],
        summary: 'Revoke a certificate',
        ...secured,
        params: z.object({ id: z.uuid(), certificateId: z.uuid() }),
        body: z.object({ reason: optionalText(300) }),
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      await service.revokeCertificate(
        requireAuth(request).userId,
        request.params.id,
        request.params.certificateId,
        request.body.reason,
      )
      await audit(request, {
        action: 'certificate.revoke',
        targetType: 'certificate',
        targetId: request.params.certificateId,
        eventId: request.params.id,
      })
      return OK
    },
  )

  app.get(
    '/public/certificates/:code',
    {
      schema: {
        tags: ['Certificates'],
        summary: 'Verify a certificate',
        params: codeParams,
        response: responses({ 200: verificationSchema }),
      },
      config: { rateLimit: limits.beacon },
    },
    async (request) => service.verifyCertificate(request.params.code),
  )

  app.get(
    '/public/certificates/:code/pdf',
    {
      schema: {
        tags: ['Certificates'],
        summary: 'Download a certificate as PDF',
        params: codeParams,
      },
      config: { rateLimit: limits.beacon },
    },
    async (request, reply) => {
      const pdf = await service.certificatePdf(request.params.code)
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="${pdf.filename}"`)
        .header('cache-control', 'private, max-age=300')
        .send(pdf.content)
    },
  )
}
