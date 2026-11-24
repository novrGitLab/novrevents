import { PrismaPg } from '@prisma/adapter-pg'
import { env } from '../config/env.js'
import { Prisma, PrismaClient } from '../generated/prisma/client.js'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: 20 })

/** Single shared client per process (each instance owns a connection pool). */
export const prisma = new PrismaClient({ adapter })

export { Prisma }

/** A client usable inside or outside a transaction. */
export type Db = PrismaClient | Prisma.TransactionClient
export type Tx = Prisma.TransactionClient

/**
 * Options for transactions that take a row lock and may queue behind other writers
 * (form submissions, registration, check-in). The defaults (2s / 5s) are too short under bursts.
 */
export const LOCKING_TX = { maxWait: 15_000, timeout: 20_000 } as const

export function isUniqueViolation(error: unknown, constraintIncludes?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
    return false
  if (!constraintIncludes) return true
  const meta = JSON.stringify(error.meta ?? {})
  return meta.includes(constraintIncludes)
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}
