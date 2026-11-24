import { defineConfig } from 'vitest/config'
import { TEST_ENV } from './src/tests/test-env.js'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    globalSetup: ['src/tests/global-setup.ts'],
    // Every file talks to the same PostgreSQL database, so files run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: TEST_ENV,
  },
})
