import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../lib/db.js'
import { createTestApp, createUser, errorCode, TestClient } from './helpers.js'

interface OwnProfile {
  username: string
  headline: string | null
  bio: string | null
  avatarUrl: string | null
  visibility: string
  publicFields: string[]
  shareRegistrations: boolean
  socialLinks: Record<string, string | null>
  profileUrl: string
}
interface PublicProfile {
  username: string
  displayName: string
  headline: string | null
  bio: string | null
  avatarUrl: string | null
  socialLinks: Record<string, string | null> | null
  canSeeRegistrations: boolean
}

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})

afterAll(async () => {
  await app.close()
})

const pngImage = () =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 20, g: 110, b: 130 } } })
    .png()
    .toBuffer()

describe('profiles', () => {
  it('starts with privacy-conscious defaults', async () => {
    const user = await createUser(app)
    const profile = await user.client.get<OwnProfile>('/api/v1/profiles/me')
    expect(profile.status).toBe(200)
    // Registered-event sharing must be off until the user explicitly turns it on.
    expect(profile.body.shareRegistrations).toBe(false)
    expect(profile.body.profileUrl).toBe(`http://localhost:3100/u/${user.username}`)
  })

  it('updates profile details and rejects unsafe links', async () => {
    const user = await createUser(app)
    const update = await user.client.patch<OwnProfile>('/api/v1/profiles/me', {
      headline: 'Detection engineer',
      bio: 'I break things politely.',
      socialLinks: { github: 'https://github.com/example', website: '' },
    })
    expect(update.status).toBe(200)
    expect(update.body).toMatchObject({
      headline: 'Detection engineer',
      bio: 'I break things politely.',
    })
    expect(update.body.socialLinks).toMatchObject({
      github: 'https://github.com/example',
      website: null,
    })

    const unsafe = await user.client.patch('/api/v1/profiles/me', {
      socialLinks: { website: 'javascript:alert(1)' },
    })
    expect(unsafe.status).toBe(400)

    const taken = await createUser(app)
    const clash = await user.client.patch('/api/v1/profiles/me', { username: taken.username })
    expect(clash.status).toBe(409)
    expect(errorCode(clash)).toBe('USERNAME_TAKEN')
  })

  it('shows only the fields the owner made public', async () => {
    const user = await createUser(app)
    await user.client.patch('/api/v1/profiles/me', {
      headline: 'Security researcher',
      bio: 'Private thoughts',
      socialLinks: { linkedin: 'https://www.linkedin.com/in/example' },
      publicFields: ['headline'],
    })
    const view = await new TestClient(app).get<PublicProfile>(`/api/v1/profiles/${user.username}`)
    expect(view.status).toBe(200)
    expect(view.body.headline).toBe('Security researcher')
    expect(view.body.bio).toBeNull()
    expect(view.body.socialLinks).toBeNull()
    expect(view.body.canSeeRegistrations).toBe(false)
    // The account email is never part of a public profile.
    expect(JSON.stringify(view.body)).not.toContain(user.email)
  })

  it('hides a private profile from everyone except its owner', async () => {
    const user = await createUser(app)
    const other = await createUser(app)
    await user.client.patch('/api/v1/profiles/me', { visibility: 'PRIVATE' })

    expect((await new TestClient(app).get(`/api/v1/profiles/${user.username}`)).status).toBe(404)
    expect((await other.client.get(`/api/v1/profiles/${user.username}`)).status).toBe(404)
    expect((await user.client.get(`/api/v1/profiles/${user.username}`)).status).toBe(200)

    const qr = await user.client.get(`/api/v1/profiles/${user.username}/qr`)
    expect(qr.status).toBe(409)
    expect(errorCode(qr)).toBe('PROFILE_PRIVATE')
  })

  it('generates a QR code for a public profile', async () => {
    const user = await createUser(app)
    const svg = await new TestClient(app).get(`/api/v1/profiles/${user.username}/qr`)
    expect(svg.status).toBe(200)
    expect(String(svg.headers['content-type'])).toContain('image/svg+xml')
    expect(svg.raw.toString()).toContain('<svg')

    const png = await new TestClient(app).get(`/api/v1/profiles/${user.username}/qr`, {
      query: { format: 'png' },
    })
    expect(String(png.headers['content-type'])).toContain('image/png')
    expect(png.raw.subarray(1, 4).toString()).toBe('PNG')
  })

  it('accepts a real image as the profile photo, re-encodes it and serves it publicly', async () => {
    const user = await createUser(app)
    const upload = await user.client.request<OwnProfile>('POST', '/api/v1/profiles/me/avatar', {
      multipart: {
        files: [
          {
            field: 'file',
            filename: 'me.png',
            contentType: 'image/png',
            content: await pngImage(),
          },
        ],
      },
    })
    expect(upload.status).toBe(200)
    expect(upload.body.avatarUrl).toMatch(
      /^\/api\/v1\/files\/public\/avatars\/[A-Za-z0-9_-]+\.webp$/,
    )

    const file = await new TestClient(app).get(upload.body.avatarUrl as string)
    expect(file.status).toBe(200)
    expect(String(file.headers['content-type'])).toBe('image/webp')
    const metadata = await sharp(file.raw).metadata()
    expect(metadata.format).toBe('webp')
    expect(metadata.width).toBe(400)
    expect(metadata.height).toBe(400)

    const removed = await user.client.delete<OwnProfile>('/api/v1/profiles/me/avatar')
    expect(removed.body.avatarUrl).toBeNull()
    expect((await new TestClient(app).get(upload.body.avatarUrl as string)).status).toBe(404)
  })

  it('rejects files that are not images, whatever they claim to be', async () => {
    const user = await createUser(app)
    const disguised = await user.client.request('POST', '/api/v1/profiles/me/avatar', {
      multipart: {
        files: [
          {
            field: 'file',
            filename: 'photo.png',
            contentType: 'image/png',
            content: Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            ),
          },
        ],
      },
    })
    expect(disguised.status).toBe(415)
    expect(errorCode(disguised)).toBe('UNSUPPORTED_MEDIA_TYPE')
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })
    expect(profile.avatarKey).toBeNull()
  })

  it('does not serve arbitrary storage paths', async () => {
    const anonymous = new TestClient(app)
    expect(
      (await anonymous.get('/api/v1/files/public/avatars/..%2F..%2Fprivate%2Fsecret.webp')).status,
    ).toBe(404)
    expect((await anonymous.get('/api/v1/files/private/anything.pdf')).status).toBe(404)
  })
})
