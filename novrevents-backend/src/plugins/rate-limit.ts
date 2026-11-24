import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'

/**
 * Per-route limits, applied through `config: { rateLimit: limits.auth }`.
 * Counters are kept in memory per process, which is correct for the single-instance VPS
 * deployment. Running several API instances behind a load balancer needs a shared store.
 */
export const limits = {
  /** Login, registration, password reset: slows credential stuffing and enumeration. */
  auth: { max: 10, timeWindow: '1 minute' },
  /** Endpoints that send email on request. */
  email: { max: 5, timeWindow: '10 minutes' },
  /** Guest form submissions and uploads. */
  publicForm: { max: 20, timeWindow: '1 minute' },
  /** Anonymous analytics beacons and abuse reports. */
  beacon: { max: 120, timeWindow: '1 minute' },
  report: { max: 5, timeWindow: '10 minutes' },
  /** QR scanning at the door: generous, but still bounded per device. */
  scan: { max: 240, timeWindow: '1 minute' },
} as const

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  if (!env.RATE_LIMIT_ENABLED) return
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) =>
      new AppError(429, 'RATE_LIMITED', `Too many requests. Try again in ${context.after}.`),
  })
}
