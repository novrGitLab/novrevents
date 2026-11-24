import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

/** URL-safe random token. 32 bytes = 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Keyed hash bound to a purpose, so a value signed for one feature can never be replayed in another.
 */
export function hmac(purpose: string, value: string): string {
  return createHmac('sha256', env.SESSION_SECRET)
    .update(`${purpose}\u0000${value}`)
    .digest('base64url')
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

// Unambiguous alphabet: no 0/O or 1/I/L, so codes survive being read aloud or typed by hand.
const SAFE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/**
 * Human-readable random code such as `7K2M-9QXD-4HTP`.
 * Uses rejection sampling so every symbol is equally likely.
 */
export function randomCode(groups = 3, groupLength = 4): string {
  const total = groups * groupLength
  const symbols: string[] = []
  while (symbols.length < total) {
    for (const byte of randomBytes(total * 2)) {
      // 31 symbols: accept bytes below the largest multiple of 31 to avoid modulo bias.
      if (byte < 248 && symbols.length < total) {
        symbols.push(SAFE_ALPHABET[byte % SAFE_ALPHABET.length] as string)
      }
    }
  }
  const parts: string[] = []
  for (let index = 0; index < groups; index += 1) {
    parts.push(symbols.slice(index * groupLength, (index + 1) * groupLength).join(''))
  }
  return parts.join('-')
}

// ─── Password hashing (scrypt) ───────────────────────────────────────────────
// Format: scrypt$<log2 N>$<r>$<p>$<salt b64url>$<hash b64url>
// Parameters are stored with each hash so the work factor can be raised later without a migration.

const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64

function deriveKey(
  password: string,
  salt: Buffer,
  logN: number,
  r: number,
  p: number,
): Promise<Buffer> {
  const cost = 2 ** logN
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: cost, r, p, maxmem: 256 * cost * r },
      (error, key) => (error ? reject(error) : resolve(key)),
    )
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const logN = env.PASSWORD_HASH_LOG_N
  const key = await deriveKey(password, salt, logN, SCRYPT_R, SCRYPT_P)
  return [
    'scrypt',
    logN,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, logN, r, p, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !logN || !r || !p || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = await deriveKey(
    password,
    Buffer.from(salt, 'base64url'),
    Number(logN),
    Number(r),
    Number(p),
  )
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** True when a stored hash was created with a weaker work factor than the current setting. */
export function passwordNeedsRehash(stored: string): boolean {
  const logN = Number(stored.split('$')[1])
  return !Number.isFinite(logN) || logN < env.PASSWORD_HASH_LOG_N
}

/**
 * Burn roughly the same time as a real verification. Used when the account does not exist so that
 * response timing does not reveal which email addresses are registered.
 */
export async function fakePasswordCheck(): Promise<void> {
  await deriveKey(
    'timing-equaliser',
    Buffer.alloc(16, 1),
    env.PASSWORD_HASH_LOG_N,
    SCRYPT_R,
    SCRYPT_P,
  )
}

// ─── Signed, stateless tokens ────────────────────────────────────────────────

/** `<payload>.<signature>`; the payload must not contain a dot. */
export function signValue(purpose: string, payload: string): string {
  return `${payload}.${hmac(purpose, payload).slice(0, 32)}`
}

/** Returns the payload when the signature is valid, otherwise null. */
export function verifySignedValue(purpose: string, token: string): string | null {
  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null
  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  const expected = hmac(purpose, payload).slice(0, 32)
  return safeEqual(signature, expected) ? payload : null
}

/**
 * Privacy-preserving client fingerprint: a salted hash that cannot be turned back into an IP.
 * Pass a `scope` (for example the current date) to make the value rotate.
 */
export function clientKey(ip: string, scope = ''): string {
  return hmac('client-key', `${scope}|${ip}`).slice(0, 32)
}
