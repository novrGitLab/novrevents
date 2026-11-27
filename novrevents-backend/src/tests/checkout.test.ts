import { verifyPendingPayments } from '../modules/payments/paystack.js'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { env } from '../config/env.js'
import { prisma } from '../lib/db.js'
import {
  approveRegistration,
  expireCheckouts,
  recordCharge,
} from '../modules/registrations/registration.service.js'
import {
  createEventWithRegistration,
  createTestApp,
  createUser,
  submit,
  type TestUser,
} from './helpers.js'

let app: FastifyInstance
let organizer: TestUser
const original = env.PAYSTACK_SECRET_KEY
beforeAll(async () => {
  app = await createTestApp()
  organizer = await createUser(app)
  env.PAYSTACK_SECRET_KEY = 'fixture-only'
  await prisma.user.update({
    where: { id: organizer.id },
    data: { payoutSubaccount: 'ACCT_fixture' },
  })
})
afterAll(async () => {
  env.PAYSTACK_SECRET_KEY = original
  await app.close()
})

async function held(review: boolean) {
  const { event, form } = await createEventWithRegistration(organizer, {
    settings: { autoAccept: !review },
  })
  await prisma.ticketType.updateMany({ where: { eventId: event.id }, data: { priceKobo: 325000 } })
  const email = 'checkout-' + crypto.randomUUID() + '@example.test'
  const response = await submit(app, form.slug, { full_name: 'Ticket holder', email })
  expect(response.status).toBe(201)
  expect(response.body.registration?.status).toBe('PENDING')
  const reg = await prisma.registration.findFirstOrThrow({
    where: { eventId: event.id },
    include: { ticket: true },
  })
  expect(reg.ticket).toBeNull()
  expect(reg.amountKobo).toEqual(325000)
  const ref = 'nev-' + crypto.randomUUID()
  await prisma.paymentAttempt.create({ data: { reference: ref, registrationId: reg.id } })
  const data = {
    reference: ref,
    amount: 325000,
    currency: 'NGN',
    status: 'success',
    customer: { email },
    paid_at: new Date().toISOString(),
  }
  return { reg, ref, data, event }
}

it('approves a reviewed order without issuing a ticket and fulfils one verified charge once', async () => {
  const { reg, ref, data } = await held(true)
  expect(reg.paymentDueAt).toBeNull()
  const approved = await approveRegistration(reg.id, organizer.id)
  expect(approved.status).toBe('PENDING')
  expect(approved.paymentDueAt).toBeTruthy()
  await Promise.all([recordCharge(ref, data), recordCharge(ref, data)])
  expect(await prisma.ticket.count({ where: { registrationId: reg.id } })).toBe(1)
  expect(await prisma.registration.findUnique({ where: { id: reg.id } })).toMatchObject({
    status: 'CONFIRMED',
    paidReference: ref,
  })
})

it('retains a mismatched payment for reconciliation and releases an expired seat', async () => {
  const { reg, ref, data, event } = await held(false)
  await recordCharge(ref, { ...data, amount: 100 })
  expect(await prisma.paymentAttempt.findUnique({ where: { reference: ref } })).toMatchObject({
    outcome: 'RECONCILE',
  })
  await expireCheckouts(new Date(reg.paymentDueAt!.getTime() + 1))
  expect(await prisma.ticket.count({ where: { registrationId: reg.id } })).toBe(0)
  expect(await prisma.event.findUnique({ where: { id: event.id } })).toMatchObject({
    registeredCount: 0,
  })
})

it('recovers a paid checkout without a webhook or returning browser', async () => {
  const { reg, ref, data } = await held(false)
  const fake = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).endsWith('/' + ref)) return Response.json({ status: true, data })
    throw new Error('No fixture for this reference')
  })
  try {
    await verifyPendingPayments(new Date(Date.now() + 500))
    expect(await prisma.paymentAttempt.findUnique({ where: { reference: ref } })).toMatchObject({
      outcome: 'PAID',
    })
    expect(await prisma.ticket.count({ where: { registrationId: reg.id } })).toBe(1)
  } finally {
    fake.mockRestore()
  }
})
