import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { appUrl, env } from '../../config/env.js'
import { prisma } from '../../lib/db.js'
import { audit } from '../../lib/audit.js'
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.js'
import {
  idParams,
  responses,
  secured,
  paginated,
  paginationQuery,
  pageOf,
  skipTake,
} from '../../lib/http.js'
import { requireAdmin } from '../../middleware/auth.js'
import { limits } from '../../plugins/rate-limit.js'
import { registrationIdForToken } from '../registrations/attendee.service.js'
import { lockEvent, recordCharge } from '../registrations/registration.service.js'

const subaccount = z.string().regex(/^ACCT_[A-Za-z0-9]{6,64}$/)
const referenceSchema = z.string().regex(/^nev-[0-9a-f-]{36}$/)
const paymentResult = z.object({
  reference: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  customer: z.object({ email: z.email() }),
  paid_at: z.string().nullable(),
})
async function provider(path: string, body?: Record<string, unknown>) {
  if (!env.PAYSTACK_SECRET_KEY)
    throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Online checkout is unavailable.')
  const response = await fetch('https://api.paystack.co' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok)
    throw new AppError(502, 'PAYMENT_PROVIDER', 'Paystack could not complete this request.')
  const envelope = z
    .object({ status: z.literal(true), data: z.unknown() })
    .parse(await response.json())
  return envelope.data
}
async function verify(reference: string) {
  const data = paymentResult.parse(
    await provider('/transaction/verify/' + encodeURIComponent(reference)),
  )
  await recordCharge(reference, data)
}
async function startCheckout(token: string) {
  const id = await registrationIdForToken(token)
  const current = await prisma.registration.findUniqueOrThrow({
    where: { id },
    select: { eventId: true },
  })
  const order = await prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, current.eventId)
    const registration = await tx.registration.findUniqueOrThrow({ where: { id } })
    if (
      event.status === 'CANCELLED' ||
      event.moderationStatus === 'REMOVED' ||
      !registration.amountKobo ||
      !registration.checkoutSubaccount ||
      registration.status !== 'PENDING' ||
      registration.paidReference ||
      !registration.paymentDueAt ||
      registration.paymentDueAt <= new Date()
    )
      throw conflict('This ticket is unavailable for payment.')
    const last = await tx.paymentAttempt.findFirst({
      where: { registrationId: id, outcome: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    })
    if (last?.checkoutUrl) return { reference: last.reference, url: last.checkoutUrl }
    if (last && last.createdAt.getTime() > Date.now() - 45000)
      throw conflict('Checkout is opening. Try again in a moment.')
    const reference = 'nev-' + randomUUID()
    await tx.paymentAttempt.create({ data: { reference, registrationId: id } })
    return {
      reference,
      email: registration.attendeeEmail,
      amount: registration.amountKobo,
      subaccount: registration.checkoutSubaccount,
    }
  })
  if (order.url) return { reference: order.reference, url: order.url }
  const data = z
    .object({ authorization_url: z.url(), reference: referenceSchema })
    .parse(
      await provider('/transaction/initialize', {
        reference: order.reference,
        email: order.email,
        amount: order.amount,
        currency: 'NGN',
        subaccount: order.subaccount,
        callback_url: appUrl + '/checkout/return',
      }),
    )
  if (
    data.reference !== order.reference ||
    new URL(data.authorization_url).origin !== 'https://checkout.paystack.com'
  )
    throw new AppError(502, 'CHECKOUT_INVALID', 'Checkout could not be opened.')
  await prisma.paymentAttempt.update({
    where: { reference: order.reference },
    data: { checkoutUrl: data.authorization_url },
  })
  return { reference: order.reference, url: data.authorization_url }
}

export const paymentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/admin/payments',
    {
      schema: {
        tags: ['Admin'],
        ...secured,
        querystring: paginationQuery.extend({ outcome: z.enum(['RECONCILE', 'PAID']) }),
        response: responses({
          200: paginated(
            z.object({ reference: z.string(), title: z.string(), amountKobo: z.number().int() }),
          ),
        }),
      },
    },
    async (req) => {
      requireAdmin(req)
      const { page, pageSize, outcome } = req.query
      const [rows, total] = await prisma.$transaction([
        prisma.paymentAttempt.findMany({
          where: { outcome },
          select: {
            reference: true,
            registration: { select: { amountKobo: true, event: { select: { title: true } } } },
          },
          orderBy: [{ createdAt: 'desc' }, { reference: 'desc' }],
          ...skipTake(page, pageSize),
        }),
        prisma.paymentAttempt.count({ where: { outcome } }),
      ])
      return pageOf(
        rows.map((row) => ({
          reference: row.reference,
          title: row.registration.event.title,
          amountKobo: row.registration.amountKobo ?? 0,
        })),
        total,
        page,
        pageSize,
      )
    },
  )
  app.put(
    '/admin/users/:id/payout',
    {
      schema: {
        tags: ['Admin'],
        ...secured,
        params: idParams,
        body: z.object({ code: subaccount }),
        response: responses({ 200: z.object({ businessName: z.string() }) }),
      },
    },
    async (req) => {
      requireAdmin(req)
      const bank = z
        .object({
          subaccount_code: subaccount,
          currency: z.literal('NGN'),
          active: z.literal(true),
          business_name: z.string().min(1),
        })
        .parse(await provider('/subaccount/' + req.body.code))
      if (bank.subaccount_code !== req.body.code)
        throw conflict('Paystack returned a different subaccount.')
      await prisma.user.update({
        where: { id: req.params.id },
        data: { payoutSubaccount: bank.subaccount_code },
      })
      await audit(req, {
        action: 'admin.payout.link',
        targetType: 'user',
        targetId: req.params.id,
        metadata: { subaccount: bank.subaccount_code },
      })
      return { businessName: bank.business_name }
    },
  )
  app.post(
    '/public/registrations/:token/checkout',
    {
      config: { rateLimit: limits.auth },
      schema: {
        tags: ['Payments'],
        params: z.object({ token: z.string().min(40).max(120) }),
        response: responses({ 200: z.object({ url: z.url(), reference: z.string() }) }),
      },
    },
    (req) => startCheckout(req.params.token),
  )
  app.post(
    '/payments/:reference/verify',
    {
      config: { rateLimit: limits.auth },
      schema: {
        tags: ['Payments'],
        params: z.object({ reference: referenceSchema }),
        response: responses({ 200: z.object({ outcome: z.string() }) }),
      },
    },
    async (req) => {
      const reference = req.params.reference
      const attempt = await prisma.paymentAttempt.findUnique({
        where: { reference },
        select: { outcome: true },
      })
      if (!attempt) throw notFound('Payment')
      if (attempt.outcome !== 'OPEN') return attempt
      await verify(reference)
      return prisma.paymentAttempt.findUniqueOrThrow({
        where: { reference },
        select: { outcome: true },
      })
    },
  )
  await app.register(async (hook) => {
    hook.removeContentTypeParser('application/json')
    hook.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: 256 * 1024 },
      (_req, buf, done) => done(null, buf),
    )
    hook.post(
      '/payments/paystack/webhook',
      {
        config: { csrf: false, rateLimit: { max: 600, timeWindow: '1 minute' } },
        schema: { tags: ['Payments'] },
      },
      async (req, reply) => {
        const body = req.body
        const sig = req.headers['x-paystack-signature']
        if (
          !env.PAYSTACK_SECRET_KEY ||
          !Buffer.isBuffer(body) ||
          typeof sig !== 'string' ||
          !/^[0-9a-f]{128}$/.test(sig) ||
          !timingSafeEqual(
            createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(body).digest(),
            Buffer.from(sig, 'hex'),
          )
        )
          throw forbidden('Invalid webhook signature.')
        const message = z
          .object({
            event: z.string(),
            data: z.object({ reference: z.string().optional() }).passthrough(),
          })
          .parse(JSON.parse(body.toString('utf8')))
        if (
          message.event === 'charge.success' &&
          referenceSchema.safeParse(message.data.reference).success
        ) {
          const reference = message.data.reference!
          const entry = await prisma.paymentAttempt.findUnique({
            where: { reference },
            select: { outcome: true },
          })
          if (entry?.outcome === 'OPEN') await verify(reference)
        }
        return reply.code(200).send({ ok: true })
      },
    )
  })
}
