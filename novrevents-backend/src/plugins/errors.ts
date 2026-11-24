import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod'
import { isProduction } from '../config/env.js'
import { Prisma } from '../lib/db.js'
import { AppError, type ErrorDetail } from '../lib/errors.js'

function send(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: ErrorDetail[],
) {
  return reply.status(statusCode).send({
    error: { code, message, ...(details?.length ? { details } : {}), requestId: request.id },
  })
}

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  406: 'NOT_ACCEPTABLE',
  408: 'REQUEST_TIMEOUT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
}

/** Every failure leaves the API in the same envelope; internals are never echoed to the client. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    if (error instanceof AppError) {
      return send(request, reply, error.statusCode, error.code, error.message, error.details)
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => ({
        path: `${error.validationContext ?? 'body'}${issue.instancePath}`.replace(/\//g, '.'),
        message: issue.message ?? 'Invalid value.',
      }))
      return send(request, reply, 400, 'VALIDATION_ERROR', 'Some fields are invalid.', details)
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, cause: error.cause }, 'response did not match its schema')
      return send(request, reply, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return send(request, reply, 409, 'CONFLICT', 'That value is already in use.')
      }
      if (error.code === 'P2025') {
        return send(request, reply, 404, 'NOT_FOUND', 'Resource not found.')
      }
      if (error.code === 'P2028') {
        request.log.warn({ err: error }, 'transaction could not start or timed out')
        reply.header('retry-after', '2')
        return send(
          request,
          reply,
          503,
          'BUSY',
          'The service is busy. Please try again in a moment.',
        )
      }
    }

    const statusCode =
      'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500
    if (statusCode >= 400 && statusCode < 500) {
      const code = STATUS_CODES[statusCode] ?? 'BAD_REQUEST'
      return send(request, reply, statusCode, code, error.message)
    }

    request.log.error({ err: error }, 'unhandled error')
    const message = isProduction ? 'Something went wrong. Please try again.' : error.message
    return send(request, reply, 500, 'INTERNAL_ERROR', message)
  })

  app.setNotFoundHandler((request, reply) =>
    send(request, reply, 404, 'NOT_FOUND', 'Route not found.'),
  )
}
