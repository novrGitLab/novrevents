// Writes docs/openapi.json from the live route definitions.
// The frontend generates its API types from this file, so run it after any contract change.
import { mkdir, writeFile } from 'node:fs/promises'

process.env.NODE_ENV ??= 'development'
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi'
process.env.SESSION_SECRET ??= 'openapi-generation-only-secret-0123456789abcdef'
process.env.JOBS_ENABLED = 'false'
process.env.LOG_LEVEL = 'silent'

const { buildApp } = await import('../src/app.js')
const app = await buildApp()
await app.ready()
const document = app.swagger()
await mkdir('docs', { recursive: true })
await writeFile('docs/openapi.json', `${JSON.stringify(document, null, 2)}\n`)
const paths = Object.keys((document as { paths?: Record<string, unknown> }).paths ?? {})
console.log(`docs/openapi.json written (${paths.length} paths)`)
await app.close()
process.exit(0)
