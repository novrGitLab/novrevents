# NOVR Events — API

REST API for **NOVR Events**, the cybersecurity event discovery and management platform by Cybernovr.
It owns authentication, authorization, events, registration forms and their rules engine, tickets and
QR check-in, communications, analytics, certificates and administration.

Node.js 24 · TypeScript (strict) · Fastify 5 · PostgreSQL 17 · Prisma 7 · Zod 4.
The web app is the separate `novrevents-frontend` repository; it reaches this API only through `/api/v1`.

## Local development

Requirements: Node.js ≥ 22.12 and Docker (for PostgreSQL).

```bash
npm install
cp .env.example .env            # set SESSION_SECRET (see the comment in the file)
npm run services:up             # PostgreSQL in Docker (novrevents and novrevents_test databases)
npm run db:generate             # Prisma client
npm run db:deploy               # apply migrations
npm run dev                     # http://localhost:4000 (API docs at /docs when API_DOCS_ENABLED=true)
```

Development-only data: `npm run db:seed:dev` adds one labelled sample event; `npm run db:seed:demo`
creates fictional demo organisers, events and registrations. Both refuse to run in production or
against a non-local database. Grant platform admin with `npm run admin:promote -- you@example.com`.

With `EMAIL_DRIVER=log` (the default) emails are stored in the `messages` table and, in development
only, printed to the console. Nothing is sent.

## Commands

| Command                    | Purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `npm run dev`              | API with reload                                        |
| `npm run typecheck`        | TypeScript check                                       |
| `npm run lint`             | ESLint                                                 |
| `npm test`                 | Integration tests against a database ending in `_test` |
| `npm run check`            | All three                                              |
| `npm run build`            | Compile to `dist/`                                     |
| `npm start`                | Run the compiled API and background worker             |
| `npm run db:deploy`        | Apply pending migrations (`prisma migrate deploy`)     |
| `npm run openapi:generate` | Regenerate `docs/openapi.json` after a contract change |

## Environment

All variables are validated at startup by `src/config/env.ts`; `.env.example` lists every one with
its purpose. Production requires `DATABASE_URL`, `APP_URL`, `CORS_ORIGINS`, `SESSION_SECRET`,
`COOKIE_SECURE=true`, `TRUST_PROXY=true` and an absolute `STORAGE_LOCAL_DIR` on a persistent volume.
Email variables are deferred.

## Production

Deployed on Railway with the `Dockerfile` and `railway.json` (pre-deploy migrations, `/api/v1/ready`
health check, one replica, uploads on a volume at `/data`). PostgreSQL is a Railway database on the
private network. Step-by-step instructions: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) ·
[Features](docs/FEATURES.md) · [Security](docs/SECURITY.md) · [Deployment](docs/DEPLOYMENT.md) ·
[OpenAPI](docs/openapi.json)
