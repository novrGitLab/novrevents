import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import nodemailer from 'nodemailer'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { prisma } from '../db.js'
import { EmailSendError, type OutgoingEmail } from './provider.js'

export const senderAddress = 'dev.sheriff.fe@gmail.com'
export const sendScope = 'https://www.googleapis.com/auth/gmail.send'
const composer = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: 'windows',
  disableFileAccess: true,
  disableUrlAccess: true,
})
const key = () =>
  Buffer.from(hkdfSync('sha256', env.SESSION_SECRET, 'NovrEvents-Gmail', 'refresh-token-v1', 32))
function seal(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from(senderAddress))
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((x) => x.toString('base64url')).join('.')
}
function unseal(value: string) {
  const [iv, tag, data] = value.split('.').map((x) => Buffer.from(x, 'base64url'))
  if (!iv || !tag || !data) throw new Error('Invalid sender credential.')
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAAD(Buffer.from(senderAddress))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
export async function senderStatus() {
  const row = await prisma.mailSender.findUnique({
    where: { address: senderAddress },
    select: { authorizedAt: true, needsConsent: true },
  })
  return {
    address: senderAddress,
    connected: !!row && !row.needsConsent,
    authorizedAt: row?.authorizedAt ?? null,
    needsConsent: row?.needsConsent ?? false,
  }
}
export async function emailAvailability() {
  const emailDelivery = env.JOBS_ENABLED && (env.EMAIL_DRIVER !== 'log' || (await senderStatus()).connected)
  return { emailDelivery, accountEmail: env.NODE_ENV !== 'production' || emailDelivery }
}

async function deliver(token: string, email: OutgoingEmail) {
  const message = await composer.sendMail({
    from: { name: 'NovrEvents', address: senderAddress },
    to: { name: email.to.name ?? '', address: email.to.email },
    subject: email.subject,
    text: email.text,
    html: email.html,
    attachments: email.attachments,
    headers: email.headers,
  })
  if (!Buffer.isBuffer(message.message)) throw new EmailSendError('Email composition failed.', true)
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(message.message).toString('base64url') }),
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok)
    throw new EmailSendError(
      'Gmail API delivery failed (HTTP ' + response.status + ').',
      response.status !== 400,
    )
  return { providerMessageId: z.object({ id: z.string().min(1) }).parse(await response.json()).id }
}
export async function authorizeSender(access: string, refresh: string) {
  await deliver(access, {
    to: { email: senderAddress },
    subject: 'NovrEvents email delivery connected',
    text: 'This mailbox is connected to NovrEvents for ticket and account emails.',
    html: '<p>This mailbox is connected to NovrEvents for ticket and account emails.</p>',
  })
  const credential = seal(refresh)
  await prisma.mailSender.upsert({
    where: { address: senderAddress },
    create: { address: senderAddress, credential },
    update: { credential, authorizedAt: new Date(), needsConsent: false },
  })
}
export const gmailApiProvider = {
  name: 'gmail-api',
  async send(email: OutgoingEmail) {
    const row = await prisma.mailSender.findUniqueOrThrow({ where: { address: senderAddress } })
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        refresh_token: unseal(row.credential),
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(15000),
    })
    const body = await response.json()
    if (!response.ok) {
      if (z.object({ error: z.literal('invalid_grant') }).safeParse(body).success)
        await prisma.mailSender.updateMany({
          where: { address: senderAddress, credential: row.credential },
          data: { needsConsent: true },
        })
      throw new EmailSendError('Google sender authorization needs attention.', true)
    }
    const token = z.object({ access_token: z.string().min(1) }).parse(body)
    return deliver(token.access_token, email)
  },
}
