# Architecture

NOVR Events is two independent applications that share only a REST contract.

```
Browser ──► novrevents-frontend (Next.js 16, Vercel)
              │  /api/*  is rewritten (proxied) to API_URL
              ▼
            novrevents-backend (Fastify, Railway, Docker)
              ├─ PostgreSQL 17 (Prisma, Railway private network)
              ├─ Uploads on a Railway volume (S3-compatible storage supported for later)
              └─ Email outbox (provider deferred; EMAIL_DRIVER=log records messages only)
```

## Key decisions

| Decision                                                                                                                                                                             | Why                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Same-origin API via Next rewrites.** The browser calls `/api/v1/...` on the web origin.                                                                                            | The session cookie is first-party, HTTP-only and `SameSite=Lax`, so no third-party-cookie or CORS-credential problems, and the API URL is never exposed to scripts. |
| **Server-side sessions** (random 256-bit token in a cookie, only its SHA-256 stored).                                                                                                | Revocable immediately (logout, password reset, suspension); no JWT key management.                                                                                  |
| **CSRF**: Origin allow-list + per-session HMAC token in `X-CSRF-Token`.                                                                                                              | Defence in depth on top of SameSite cookies.                                                                                                                        |
| **Zod schemas as the single contract.** Routes declare request _and_ response schemas; the OpenAPI document is generated from them; the frontend generates types from that document. | One source of truth. Response schemas also strip undeclared fields, so a Prisma record can never leak a column.                                                     |
| **Domain modules** (`src/modules/<domain>`) with routes → services → Prisma.                                                                                                         | Business logic and authorization live in services, testable without HTTP.                                                                                           |
| **Authorization guards** (`requireEventAccess`, `requireFormAccess`, `requireOrgRole`) with capability levels.                                                                       | One place decides access; unrelated callers get 404 so existence is not disclosed.                                                                                  |
| **Form engine** is pure TypeScript (`src/modules/forms/engine`), copied verbatim to the frontend.                                                                                    | Conditional logic and validation behave identically in the browser and on the server; the server is authoritative.                                                  |
| **Versioned form definitions.** Publishing freezes a version; responses reference it.                                                                                                | Old responses keep their original questions; editing never corrupts history.                                                                                        |
| **Row locks for limits** (`SELECT … FOR UPDATE` on the form and event rows) plus CHECK constraints.                                                                                  | Response limits and capacity hold under simultaneous submissions (tested with 80 concurrent requests).                                                              |
| **Unique indexes for idempotency and duplicates** (`(form_id, idempotency_key)`, `(form_id, duplicate_hash)`, `check_ins.ticket_id`).                                                | Retries, double-clicks and concurrent scans are safe without application-level races.                                                                               |
| **Outbox for email.** Every email is a `messages` row; a worker sends it.                                                                                                            | Requests never wait on Brevo; failures retry with backoff; there is a complete message log.                                                                         |
| **Database-backed job queue** (`jobs`, `FOR UPDATE SKIP LOCKED`).                                                                                                                    | Scheduled reminders and campaigns with no Redis or cron daemon. Multiple API processes can run the worker safely.                                                   |
| **Signed ticket QR credentials** (`NOVR1:<code>:<HMAC>`).                                                                                                                            | Forged or altered codes are rejected before the database is queried; validity is always decided server-side. Profile QR codes only contain a URL and are unrelated. |
| **Derived event status.** `effectiveStatus()` computes ONGOING/COMPLETED from time; a maintenance job also persists it.                                                              | Pages are correct between job runs.                                                                                                                                 |

## Background worker

`src/jobs/worker.ts` runs inside the API process when `JOBS_ENABLED=true`, every `JOBS_POLL_INTERVAL_MS`:

1. Due jobs (`campaign.dispatch` for reminders, scheduled announcements and invitations).
2. The email outbox (`flushOutbox`).
3. Every 5 minutes: event status sync, form response retention, expired session/token cleanup.

## Module map

| Module                                   | Responsibility                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `auth`                                   | Registration, login, sessions, email verification, password reset/change, email change |
| `profiles`, `follows`, `notifications`   | Public profiles with field-level visibility, QR, following, in-app notifications       |
| `organizations`                          | Optional workspaces with OWNER/ADMIN/MEMBER roles                                      |
| `events`                                 | Event CRUD, lifecycle, discovery, saved events, abuse reports, page-view beacon        |
| `schedules`, `tasks`                     | Agenda sessions, speakers, team members, tasks and checklist                           |
| `forms`, `submissions`                   | Builder, versions, public rendering and submission, response management                |
| `registrations`, `tickets`, `attendance` | Registrations, ticket types, tickets/QR/PDF, check-in                                  |
| `communications`                         | Outbox, templates, campaigns, reminders, invitations, preferences, Brevo webhook       |
| `analytics`, `certificates`, `admin`     | Metrics, certificates, platform administration and settings                            |
