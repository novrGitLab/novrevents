# Deployment — Vercel (web) and Railway (API, PostgreSQL, uploads)

This guide is identical in both repositories.

| Part              | Platform                          | Domain                       | Repository            |
| ----------------- | --------------------------------- | ---------------------------- | --------------------- |
| Web app (Next.js) | Vercel                            | `https://novrevents.com`     | `novrevents-frontend` |
| API (Fastify)     | Railway service                   | `https://api.novrevents.com` | `novrevents-backend`  |
| Database          | Railway PostgreSQL                | private network only         | —                     |
| Uploaded files    | Railway volume on the API         | mounted at `/data`           | —                     |
| Email             | **Deferred** (`EMAIL_DRIVER=log`) | —                            | —                     |

## How the pieces talk

```
browser ──HTTPS──▶ novrevents.com (Vercel)
                     ├─ pages
                     └─ /api/*  ──rewrite──▶ https://api.novrevents.com/api/*  (Railway API)
                                                     ├─ PostgreSQL (private network)
                                                     └─ /data/uploads (volume)
```

The browser only ever talks to `novrevents.com`. Next.js rewrites `/api/*` to the API, so the session
cookie is first-party, HTTP-only and needs no `Domain` attribute, and no CORS preflight happens in
normal use. Uploaded images are served at `/api/v1/files/public/…` through the same rewrite.

## 1. Repository layout

Both applications live in one GitHub repository (`novrGitLab/novrevents`), each in its own folder
with its own `package.json`, lockfile, `.gitignore` and `.env.example`:

```
novrevents/
├─ novrevents-frontend/   → Vercel, root directory novrevents-frontend
└─ novrevents-backend/    → Railway, root directory novrevents-backend
```

There are no GitHub Actions workflows. Run `npm run check` in each folder before pushing.

## 2. Railway: PostgreSQL

1. New project → **Add PostgreSQL**. Do **not** enable a public TCP proxy; the API reaches it over
   Railway's private network.
2. Enable backups for the database volume (Railway → Postgres → Backups) and schedule them daily.

## 3. Railway: API service

1. **New service → GitHub repo** → `novrevents`. In Service → Settings set **Root Directory**
   `novrevents-backend` and **Railway Config File** `/novrevents-backend/railway.json` (the config
   path is absolute from the repository root). `railway.json` then sets:
   - watch paths `/novrevents-backend/**` (frontend-only commits do not redeploy the API);
   - build with the `Dockerfile` (Node 24, `prisma generate`, `npm run build`, dev dependencies pruned);
   - **pre-deploy command** `npx prisma migrate deploy` (applies pending migrations once per deploy,
     before traffic switches);
   - start command `node dist/server.js` (API and background worker in one process);
   - health check `GET /api/v1/ready` (fails until the database answers);
   - one replica (see "Single instance" below).
2. **Volume**: Service → Volumes → add a volume mounted at **`/data`**.
   Railway mounts volumes as `root`; the image runs as the `node` user, so also set the service variable
   `RAILWAY_RUN_UID=0`. The API checks at startup that `STORAGE_LOCAL_DIR` is writable and exits with a
   clear message if it is not.
3. **Variables** (Service → Variables):

| Variable             | Value                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`           | `production`                                                                                                |
| `DATABASE_URL`       | `${{Postgres.DATABASE_URL}}` (private URL reference)                                                        |
| `APP_URL`            | `https://novrevents.com`                                                                                    |
| `CORS_ORIGINS`       | `https://novrevents.com` (add `https://www.novrevents.com` only if www serves pages instead of redirecting) |
| `SESSION_SECRET`     | 48+ random characters (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`)    |
| `COOKIE_SECURE`      | `true`                                                                                                      |
| `TRUST_PROXY`        | `true`                                                                                                      |
| `STORAGE_DRIVER`     | `local`                                                                                                     |
| `STORAGE_LOCAL_DIR`  | `/data/uploads`                                                                                             |
| `EMAIL_DRIVER`       | `log` (deferred; do not add `BREVO_API_KEY`)                                                                |
| `EMAIL_FROM_ADDRESS` | an address on your domain, for when email is enabled                                                        |
| `API_DOCS_ENABLED`   | `false`                                                                                                     |
| `RAILWAY_RUN_UID`    | `0` (volume permissions, see above)                                                                         |

Leave `PORT` unset (Railway injects it) and `HOST` at its default `0.0.0.0`. Leave `COOKIE_DOMAIN`
empty. The API refuses to start in production if `COOKIE_SECURE` is not `true`, if
`SESSION_SECRET` is the example value, or if `STORAGE_LOCAL_DIR` is not an absolute path. 4. **Domain**: Service → Settings → Networking → custom domain `api.novrevents.com`. Railway shows a
CNAME target; create it at your DNS provider. 5. **Platform admin**: after the first deploy, register your account on the website, then run
`npm run admin:promote -- you@example.com` once from a Railway shell (`railway ssh`) or locally with
the production `DATABASE_URL`. Never run `db:seed:dev` or `db:seed:demo` against production; both
refuse to.

### Migrations

- Migrations live in `prisma/migrations` and are applied only by `prisma migrate deploy` in the
  pre-deploy step. Nothing seeds data automatically.
- Before a deploy that contains a new migration: take a database backup, read the migration SQL, and
  deploy. If the pre-deploy step fails, Railway keeps the previous version running.
- Never run `prisma migrate reset`, `db push` or `migrate dev` against production.

### Single instance and uploads

Files are written to the volume at `/data/uploads` (`public/` for banners, logos, avatars and speaker
photos; `private/` for form attachments, served only through authorised routes as downloads). A Railway
volume attaches to one instance, and rate-limit counters are in memory, so the API must run as **one
replica**. Scaling out later needs S3-compatible storage (`STORAGE_DRIVER=s3`, already supported) and
a shared rate-limit store.

### Backup and recovery

| Data       | Backup                                                                                                                                               | Restore                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| PostgreSQL | Railway daily backups, plus a weekly off-platform `pg_dump -Fc` (run locally against the public proxy URL enabled only for the duration of the dump) | Railway "Restore", or `pg_restore --clean --no-owner -d <url> backup.dump` into a fresh database |
| Uploads    | Railway volume backups on `/data`; optionally `tar czf` of `/data/uploads` via `railway ssh` copied off-platform                                     | Restore the volume backup, or extract the archive into `/data/uploads`                           |

Database rows reference upload keys, so restore both from the same point in time. Test a restore into
a separate Railway environment before launch.

## 4. Vercel: web app

1. **New project → Import** `novrevents`. **Root Directory** `novrevents-frontend`; framework preset
   **Next.js**; install `npm ci`; build `npm run build`; output default. Enable "Skip deployments when
   there are no changes to the root directory or its dependencies" so backend-only commits do not
   rebuild the web app.
2. **Node.js version**: 24.x (Project → Settings → General).
3. **Environment variables**:

| Variable                     | Production                   | Preview                                       |
| ---------------------------- | ---------------------------- | --------------------------------------------- |
| `API_URL`                    | `https://api.novrevents.com` | `https://api.novrevents.com` or a staging API |
| `NEXT_PUBLIC_APP_URL`        | `https://novrevents.com`     | leave unset                                   |
| `NEXT_PUBLIC_EMAIL_DELIVERY` | leave unset (email deferred) | leave unset                                   |

`API_URL` is server-only; the build fails on Vercel without it. Preview deployments are always
`noindex`, and because their origin is not in the API's `CORS_ORIGINS`, sign-in and other changes
from a preview against the production API are rejected — use a staging API for full previews. 4. **Domains**: add `novrevents.com` and `www.novrevents.com`; set www to redirect to the apex. Create
the DNS records Vercel shows (an `A` record for the apex, a `CNAME` for www).

## 5. DNS summary

| Name                 | Type      | Target                 |
| -------------------- | --------- | ---------------------- |
| `novrevents.com`     | A / ALIAS | value shown by Vercel  |
| `www.novrevents.com` | CNAME     | value shown by Vercel  |
| `api.novrevents.com` | CNAME     | value shown by Railway |

Both platforms issue TLS certificates automatically once DNS resolves.

## 6. Verify production

1. `https://api.novrevents.com/api/v1/health` and `/api/v1/ready` return `{"status":"ok"}`.
2. `https://novrevents.com/api/v1/health` returns the same (the rewrite works).
3. Register, sign in, sign out; confirm the `novr_session` cookie is `HttpOnly`, `Secure`,
   `SameSite=Lax`, on `novrevents.com`.
4. Create a draft event, upload a cover image, redeploy the API, and confirm the image still loads
   (the volume persists).
5. Publishing needs a verified email address, which cannot be completed while email is deferred.
   No bypass exists in the product; treat this as a launch blocker for organisers (see section 7).
6. Register as a guest from a second browser, open the ticket link shown on the confirmation, scan it
   at `/dashboard/events/<id>/scanner` on a phone, and undo the check-in from Attendance.
7. Check `https://novrevents.com/robots.txt` and `/sitemap.xml`, and that a dashboard page returns an
   `X-Robots-Tag: noindex` header.
8. Look at a few `audit_logs` rows: the `ip` column should show real client addresses. If it shows
   Vercel or Railway addresses, rate limits are keyed per proxy rather than per visitor; review
   `TRUST_PROXY` before launch.

## 7. Email (deferred)

No provider is configured. With `EMAIL_DRIVER=log` every message is stored in the `messages` table and
nothing is sent; the web app (with `NEXT_PUBLIC_EMAIL_DELIVERY` unset) never says an email was sent.
Consequences until email is enabled:

| Flow                           | Effect                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Account verification           | Users cannot verify by email, so they cannot publish events or forms or send messages                  |
| Password reset                 | Not possible for users; requests are recorded only                                                     |
| Registration confirmation      | Guests must keep the ticket link shown after registering; signed-in users see tickets in their account |
| Approval, cancellation notices | Not delivered; status is visible in the attendee's account or ticket link                              |
| Organiser messages, reminders  | Recorded in the message log, not delivered                                                             |

Enabling email later is a separate assignment: configure the provider on the API (`EMAIL_DRIVER`,
provider key, verified sender domain with SPF/DKIM/DMARC), then set
`NEXT_PUBLIC_EMAIL_DELIVERY=enabled` on Vercel and redeploy the web app.
