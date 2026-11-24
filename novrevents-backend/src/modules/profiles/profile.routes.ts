import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { responses, secured } from '../../lib/http.js'
import { MAX_IMAGE_BYTES, readSingleUpload } from '../../lib/uploads.js'
import { requireAuth } from '../../middleware/auth.js'
import {
  ownProfileSchema,
  publicProfileSchema,
  updateProfileBody,
  usernameParams,
} from './profile.schemas.js'
import * as service from './profile.service.js'

export const profileRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/profiles/me',
    {
      schema: {
        tags: ['Profiles'],
        summary: 'Get your own profile and privacy settings',
        ...secured,
        response: responses({ 200: ownProfileSchema }),
      },
    },
    async (request) => service.getOwnProfile(requireAuth(request).userId),
  )

  app.patch(
    '/profiles/me',
    {
      schema: {
        tags: ['Profiles'],
        summary: 'Update your profile',
        description:
          'All fields are optional. `publicFields` selects which optional fields appear publicly. ' +
          '`shareRegistrations` is off by default and, when on, shows your confirmed registrations for ' +
          'public events to your followers only.',
        ...secured,
        body: updateProfileBody,
        response: responses({ 200: ownProfileSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const profile = await service.updateOwnProfile(auth.userId, request.body)
      const privacyKeys = ['visibility', 'publicFields', 'shareRegistrations', 'username'] as const
      const changed = privacyKeys.filter((key) => request.body[key] !== undefined)
      if (changed.length > 0) {
        await audit(request, {
          action: 'profile.privacy_updated',
          targetType: 'profile',
          targetId: auth.userId,
          metadata: Object.fromEntries(changed.map((key) => [key, request.body[key]])),
        })
      }
      return profile
    },
  )

  app.post(
    '/profiles/me/avatar',
    {
      schema: {
        tags: ['Profiles'],
        summary: 'Upload a profile photo',
        description:
          'multipart/form-data with one image file (JPEG, PNG or WebP, up to 5 MB). The image is ' +
          're-encoded, resized and stripped of metadata before it is stored.',
        ...secured,
        consumes: ['multipart/form-data'],
        response: responses({ 200: ownProfileSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const upload = await readSingleUpload(request, MAX_IMAGE_BYTES)
      return service.setAvatar(auth.userId, upload.buffer)
    },
  )

  app.delete(
    '/profiles/me/avatar',
    {
      schema: {
        tags: ['Profiles'],
        summary: 'Remove your profile photo',
        ...secured,
        response: responses({ 200: ownProfileSchema }),
      },
    },
    async (request) => service.removeAvatar(requireAuth(request).userId),
  )

  app.get(
    '/profiles/:username',
    {
      schema: {
        tags: ['Profiles'],
        summary: 'Public profile',
        description:
          'Returns only the fields the owner has made public. Private profiles return 404.',
        params: usernameParams,
        response: responses({ 200: publicProfileSchema }),
      },
    },
    async (request) =>
      service.getPublicProfile(request.params.username, request.auth?.userId ?? null),
  )

  app.get(
    '/profiles/:username/qr',
    {
      schema: {
        tags: ['Profiles'],
        summary: 'QR code for a public profile',
        description: 'Encodes the public profile URL. This is unrelated to event ticket QR codes.',
        params: usernameParams,
        querystring: z.object({ format: z.enum(['svg', 'png']).default('svg') }),
      },
    },
    async (request, reply) => {
      const qr = await service.profileQrCode(
        request.params.username,
        request.auth?.userId ?? null,
        request.query.format,
      )
      return reply
        .header('content-type', qr.contentType)
        .header('cache-control', 'public, max-age=300')
        .header('x-content-type-options', 'nosniff')
        .send(qr.body)
    },
  )
}
