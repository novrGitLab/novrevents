// Launches Vitest from the canonical working directory.
//
// On Windows some shells (for example terminals started by an editor) report the working directory
// with a lower-case drive letter (`c:\…`) while Node resolves modules with the real casing (`C:\…`).
// Vitest then loads two copies of itself and fails with "failed to find the runner". Starting the
// child process from the real path avoids that. On other platforms this is a plain pass-through.
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const cwd = realpathSync.native(process.cwd())
const entry = path.join(cwd, 'node_modules', 'vitest', 'vitest.mjs')
const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
