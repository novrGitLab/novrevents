// Copies the form engine from a local checkout of novrevents-backend and rewrites its ESM
// `.js` import suffixes for the bundler. The backend copy is authoritative.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const backend = process.env.BACKEND_DIR ?? path.resolve('..', 'novrevents-backend')
const from = path.join(backend, 'src', 'modules', 'forms', 'engine')
const to = path.join('src', 'lib', 'form-engine')
for (const file of readdirSync(from).filter((name) => name.endsWith('.ts'))) {
  const source = readFileSync(path.join(from, file), 'utf8').replace(/from '(\.\/[^']+)\.js'/g, "from '$1'")
  writeFileSync(path.join(to, file), source)
  console.log('synced', file)
}
