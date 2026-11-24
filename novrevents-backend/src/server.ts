import { buildApp } from './app.js'
import { env } from './config/env.js'
import { startWorker } from './jobs/worker.js'
import { prisma } from './lib/db.js'
import { storage } from './lib/storage/index.js'
import { LocalStorage } from './lib/storage/local.js'

async function main(): Promise<void> {
  // Uploads on local disk must be writable before the API accepts traffic (a missing or read-only
  // volume would otherwise surface only when someone uploads a file).
  if (storage instanceof LocalStorage) {
    await storage.verifyWritable().catch((error: unknown) => {
      throw new Error(`Upload directory ${env.STORAGE_LOCAL_DIR} is not writable: ${String(error)}`)
    })
  }
  const app = await buildApp()
  const stopWorker = env.JOBS_ENABLED ? startWorker(app.log) : null

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    app.log.info({ signal }, 'shutting down')
    try {
      await app.close()
      await stopWorker?.()
      await prisma.$disconnect()
      process.exit(0)
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown')
      process.exit(1)
    }
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  await app.listen({ host: env.HOST, port: env.PORT })
  app.log.info({ driver: storage.name }, 'upload storage ready')
  if (env.EMAIL_DRIVER === 'log') {
    app.log.warn(
      'EMAIL_DRIVER=log: emails are stored and logged, not delivered. Set EMAIL_DRIVER=brevo to send.',
    )
  }
  if (!env.JOBS_ENABLED)
    app.log.warn(
      'JOBS_ENABLED=false: queued email, reminders and maintenance will not run in this process.',
    )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
