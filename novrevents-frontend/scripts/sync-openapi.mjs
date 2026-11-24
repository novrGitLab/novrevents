// Copies the API contract from a local checkout of novrevents-backend.
// Usage: npm run api:sync   (set BACKEND_DIR when the backend is not at ../novrevents-backend)
import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const backend = process.env.BACKEND_DIR ?? path.resolve('..', 'novrevents-backend')
const source = path.join(backend, 'docs', 'openapi.json')
if (!existsSync(source)) {
  console.error(`Cannot find ${source}. Run "npm run openapi:generate" in the backend, or set BACKEND_DIR.`)
  process.exit(1)
}
copyFileSync(source, path.join('openapi', 'openapi.json'))
console.log('openapi/openapi.json updated from', source)
