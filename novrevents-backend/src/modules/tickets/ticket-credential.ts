import QRCode from 'qrcode'
import { appUrl } from '../../config/env.js'
import { hmac, randomCode, safeEqual } from '../../lib/crypto.js'
import { prisma } from '../../lib/db.js'
import type { Registration } from '../../generated/prisma/client.js'

// ─── Ticket QR credential ────────────────────────────────────────────────────
//
// A ticket QR code carries `NOVR1:<ticket code>:<signature>`.
//  - The code is random (12 symbols from a 31-symbol alphabet, ~59 bits) and unique.
//  - The signature is an HMAC of the code with the server secret, so a QR code cannot be forged or
//    altered: a scan is rejected before the database is consulted unless the signature is valid.
//  - Validity (right event, not void, not already used) is always decided by the server.
// Ticket QR codes are unrelated to profile QR codes, which only encode a public profile URL.

const PREFIX = 'NOVR1'
const SIGNATURE_LENGTH = 24

export const newTicketCode = () => randomCode(3, 4)

const signCode = (code: string) => hmac('ticket-qr', code).slice(0, SIGNATURE_LENGTH)

export function ticketQrPayload(code: string): string {
  return `${PREFIX}:${code}:${signCode(code)}`
}

/** Returns the ticket code when the payload is a genuine NOVR ticket credential, otherwise null. */
export function verifyTicketQr(payload: string): string | null {
  const parts = payload.trim().split(':')
  if (parts.length !== 3 || parts[0] !== PREFIX) return null
  const [, code, signature] = parts as [string, string, string]
  if (!/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(code)) return null
  return safeEqual(signature, signCode(code)) ? code : null
}

/** Normalises a ticket code typed by hand at the door ("7k2m 9qxd4htp" → "7K2M-9QXD-4HTP"). */
export function normaliseTicketCode(input: string): string | null {
  const symbols = input.toUpperCase().replace(/[^2-9A-Z]/g, '')
  if (symbols.length !== 12) return null
  return `${symbols.slice(0, 4)}-${symbols.slice(4, 8)}-${symbols.slice(8, 12)}`
}

export async function ticketQrImage(code: string, format: 'png' | 'svg'): Promise<Buffer | string> {
  const options = { errorCorrectionLevel: 'M' as const, margin: 2, width: 640 }
  const payload = ticketQrPayload(code)
  return format === 'svg'
    ? QRCode.toString(payload, { ...options, type: 'svg' })
    : QRCode.toBuffer(payload, { ...options, type: 'png' })
}

// ─── Guest access to a registration ──────────────────────────────────────────
//
// Guests have no account, so their registration is reached through a private link that is emailed
// to them: `/r/<registration id>.<signature>`. The signature covers the id and the registration's
// `accessVersion`; bumping the version invalidates every link issued before.

const accessSignature = (registration: Pick<Registration, 'id' | 'accessVersion'>) =>
  hmac('registration-access', `${registration.id}:${registration.accessVersion}`).slice(0, 32)

export function registrationAccessToken(
  registration: Pick<Registration, 'id' | 'accessVersion'>,
): string {
  return `${registration.id}.${accessSignature(registration)}`
}

export const manageUrlFor = (registration: Pick<Registration, 'id' | 'accessVersion'>) =>
  `${appUrl}/r/${registrationAccessToken(registration)}`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Resolves a guest link to its registration id, or null when the link is not valid. */
export async function registrationIdFromToken(token: string): Promise<string | null> {
  const separator = token.indexOf('.')
  if (separator < 0) return null
  const id = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  if (!UUID.test(id)) return null
  const registration = await prisma.registration.findUnique({
    where: { id },
    select: { id: true, accessVersion: true },
  })
  if (!registration || !safeEqual(signature, accessSignature(registration))) return null
  return registration.id
}
