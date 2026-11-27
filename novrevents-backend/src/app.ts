import { randomUUID } from 'node:crypto'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { allowedOrigins, env, isProduction, isTest } from './config/env.js'
import { MAX_DOCUMENT_BYTES } from './lib/uploads.js'
import { configureOutbox } from './modules/communications/outbox.js'
import { registerAuth } from './plugins/auth.js'
import { registerDocs } from './plugins/docs.js'
import { registerErrorHandling } from './plugins/errors.js'
import { registerRateLimit } from './plugins/rate-limit.js'
import { apiRoutes } from './routes.js'

function loggerOptions() {
  if (isTest) return false
  return {
    level: env.LOG_LEVEL,
    serializers: { req: (req: {method: string; routeOptions?: {url?: string}}) => ({method: req.method, route: req.routeOptions?.url}) },
    // Never write credentials or session identifiers to the log.
    redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]'],
    ...(isProduction
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }),
  }
}

/** Builds the HTTP application without starting it, so tests can drive it with `app.inject()`. */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(),
    trustProxy: env.TRUST_PROXY,
    genReqId: () => randomUUID(),
    bodyLimit: 1024 * 1024,
    routerOptions: { ignoreTrailingSlash: true },
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(helmet, {
    // The API serves JSON and files only; a strict policy stops any response being used as a page.
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: isProduction,
  })
  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id'],
    exposedHeaders: ['x-request-id', 'content-disposition'],
    maxAge: 600,
  })
  await app.register(cookie)
  await registerRateLimit(app)
  await app.register(multipart, {
    limits: {
      fileSize: MAX_DOCUMENT_BYTES,
      files: 10,
      fields: 5,
      fieldSize: 512 * 1024,
      parts: 20,
    },
  })
  await registerDocs(app)

  registerErrorHandling(app)
  registerAuth(app)
  configureOutbox({ logger: app.log })

  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id)
  })

  await app.register(apiRoutes, { prefix: '/api/v1' })

  return app
}
