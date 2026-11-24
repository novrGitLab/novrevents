// Phase 1, step 1: regression tests for behaviour that must not change while the authentication,
// onboarding and profile work is built. Each test asserts what is correct today.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  CONSENT,
  createDraftEvent,
  createPublishedForm,
  createTestApp,
  createUser,
  errorCode,
  PASSWORD,
  TestClient,
  uniqueEmail,
  uniqueUsername,
} from './helpers.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})

afterAll(async () => {
  await app.close()
})

describe('public forms never expose exclusion logic', () => {
  it('omits EXCLUDE rules from the public definition', async () => {
    const owner = await createUser(app)
    const form = await createPublishedForm(owner, {
      purpose: 'GENERAL',
      definition: {
        steps: [{ key: 'details', title: 'Details' }],
        fields: [
          {
            key: 'full_name',
            type: 'SHORT_TEXT',
            label: 'Name',
            required: true,
            stepKey: 'details',
            role: 'RESPONDENT_NAME',
          },
          {
            key: 'email',
            type: 'EMAIL',
            label: 'Email',
            required: true,
            stepKey: 'details',
            role: 'RESPONDENT_EMAIL',
          },
          {
            key: 'age_18',
            type: 'RADIO',
            label: 'Are you 18 or older?',
            required: true,
            stepKey: 'details',
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
          },
        ],
        rules: [
          {
            key: 'under_18',
            type: 'EXCLUDE',
            name: 'Under 18',
            enabled: true,
            targetFieldKeys: [],
            conditions: {
              combinator: 'AND',
              conditions: [{ fieldKey: 'age_18', operator: 'equals', value: 'no' }],
            },
          },
        ],
      },
    })

    const response = await new TestClient(app).get<{
      definition: { rules: Array<{ type: string }>; fields: unknown[] }
    }>(`/api/v1/public/forms/${form.slug}`)

    expect(response.status).toBe(200)
    expect(response.body.definition.fields.length).toBe(3)
    expect(response.body.definition.rules.map((rule) => rule.type)).not.toContain('EXCLUDE')
    // The exclusion name is organiser-only text and must not leak either.
    expect(JSON.stringify(response.body)).not.toContain('Under 18')
  })
})

describe('registered-event privacy', () => {
  it('hides registered events from anonymous visitors by default', async () => {
    const user = await createUser(app)
    const response = await new TestClient(app).get<{ visible: boolean; items: unknown[] }>(
      `/api/v1/profiles/${user.username}/registered-events`,
    )
    expect(response.status).toBe(200)
    expect(response.body.visible).toBe(false)
    expect(response.body.items).toEqual([])
  })
})

describe('profile visibility', () => {
  it('returns the same not-found response for a private profile and an unknown username', async () => {
    const owner = await createUser(app)
    const updated = await owner.client.patch('/api/v1/profiles/me', { visibility: 'PRIVATE' })
    expect(updated.status).toBe(200)

    const anonymous = new TestClient(app)
    const privateProfile = await anonymous.get(`/api/v1/profiles/${owner.username}`)
    const unknown = await anonymous.get(`/api/v1/profiles/${uniqueUsername('nobody')}`)

    expect(privateProfile.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(errorCode(privateProfile)).toBe(errorCode(unknown))
  })

  it('shows only the owner their own private profile', async () => {
    const owner = await createUser(app)
    await owner.client.patch('/api/v1/profiles/me', { visibility: 'PRIVATE' })
    const own = await owner.client.get(`/api/v1/profiles/${owner.username}`)
    expect(own.status).toBe(200)
  })
})

describe('username uniqueness under concurrency', () => {
  it('lets exactly one of two simultaneous sign-ups claim the same username', async () => {
    const username = uniqueUsername('race')
    const attempt = () =>
      new TestClient(app).post('/api/v1/auth/register', {
        ...CONSENT,
        email: uniqueEmail('race'),
        username,
        displayName: 'Race Example',
        password: PASSWORD,
      })

    const [first, second] = await Promise.all([attempt(), attempt()])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([201, 409])
    const loser = first.status === 409 ? first : second
    expect(errorCode(loser)).toBe('USERNAME_TAKEN')
  })
})

describe('email verification gates publishing', () => {
  it('refuses to publish an event from an unverified account', async () => {
    const unverified = await createUser(app, { verified: false })
    const event = await createDraftEvent(unverified)
    const response = await unverified.client.post(`/api/v1/events/${event.id}/publish`)
    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('EMAIL_NOT_VERIFIED')
  })
})

describe('certificate verification', () => {
  it('returns not found for a code that was never issued', async () => {
    const response = await new TestClient(app).get('/api/v1/public/certificates/ZZZZ-ZZZZ-ZZZZ')
    expect(response.status).toBe(404)
  })
})
// The four gaps recorded at step 1 (organiser email, consent, profile defaults, welcome) are now covered
// by phase1.test.ts.
