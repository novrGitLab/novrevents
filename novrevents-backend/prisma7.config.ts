// Prisma CLI configuration (Prisma ORM 7 reads `prisma7.config.ts`).
// The CLI does not load `.env` on its own, so it is loaded here with Node's built-in loader.
import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

if (!process.env.DATABASE_URL && existsSync('.env')) {
  process.loadEnvFile('.env')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Left undefined when absent so `prisma generate` works without a database (CI, Docker build).
    url: process.env.DATABASE_URL,
  },
})
