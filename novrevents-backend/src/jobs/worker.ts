import type { FastifyBaseLogger } from 'fastify'
import { env } from '../config/env.js'
import { flushOutbox } from '../modules/communications/outbox.js'
import { runMaintenance } from './maintenance.js'
import { runDueJobs } from './queue.js'

const MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000

/**
 * The in-process background worker: runs due jobs, sends queued email and performs periodic
 * maintenance. All state lives in PostgreSQL, so a restart loses nothing and several processes can
 * run the worker at once without duplicating work.
 */
export function startWorker(logger: FastifyBaseLogger): () => Promise<void> {
  let stopped = false
  let lastMaintenance = 0
  let running: Promise<void> = Promise.resolve()

  const tick = async () => {
    try {
      await runDueJobs({ logger })
      await flushOutbox()
      if (Date.now() - lastMaintenance > MAINTENANCE_INTERVAL_MS) {
        lastMaintenance = Date.now()
        await runMaintenance()
      }
    } catch (error) {
      logger.error({ err: error }, 'background worker tick failed')
    }
  }

  const loop = async () => {
    while (!stopped) {
      running = tick()
      await running
      await new Promise((resolve) => setTimeout(resolve, env.JOBS_POLL_INTERVAL_MS))
    }
  }
  void loop()
  logger.info({ intervalMs: env.JOBS_POLL_INTERVAL_MS }, 'background worker started')

  return async () => {
    stopped = true
    await running
  }
}
