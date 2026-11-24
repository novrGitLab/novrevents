# API

- Base path: `/api/v1`. Full contract: [`openapi.json`](./openapi.json) (OpenAPI 3.0, generated from the route
  schemas — 129 paths / 161 operations). With `API_DOCS_ENABLED=true` the interactive reference is at `/docs`.
- Regenerate after any route or schema change: `npm run openapi:generate` (CI fails if it is stale).

## Conventions

| Topic       | Rule                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Auth        | HTTP-only `novr_session` cookie. `GET /auth/session` returns `{ authenticated, user, csrfToken }`.                               |
| CSRF        | Every non-GET request made with a session must send `X-CSRF-Token: <csrfToken>`; a foreign `Origin` is rejected.                 |
| Errors      | `{ "error": { "code": "EVENT_FULL", "message": "…", "details": [{ "path", "message" }], "requestId" } }`                         |
| Validation  | `400 VALIDATION_ERROR` with `details[].path` such as `body.email` or `answers.full_name`.                                        |
| Not yours   | Resources you have no relationship to return `404`, not `403`.                                                                   |
| Pagination  | `?page=1&pageSize=20` (max 100) → `{ items, page, pageSize, total, totalPages }`.                                                |
| Times       | ISO-8601 with offset on input; UTC `…Z` on output. Events include `timezone`.                                                    |
| Request id  | Every response has `X-Request-Id`; it is also in error bodies and logs.                                                          |
| Rate limits | 300/min per IP globally; tighter limits on auth, email-sending, public forms, beacons, reports and scanning. `429 RATE_LIMITED`. |

## Main areas

| Area               | Examples                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth               | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, `/auth/change-email`, `GET/DELETE /auth/sessions`                                           |
| Profiles & follows | `GET/PATCH /profiles/me`, `POST /profiles/me/avatar`, `GET /profiles/{username}`, `/qr`, `POST/DELETE /profiles/{username}/follow`, `/followers`, `/following`, `/events`, `/registered-events`, `GET /me/feed`                                   |
| Discovery          | `GET /public/events` (q, category, type, mode, price, location, organizer, organization, registration=open, timeframe, from, to, sort), `GET /public/events/{slug}`, `PUT/DELETE /public/events/{slug}/save`, `POST /public/events/{slug}/report` |
| Events             | `GET/POST /events`, `GET/PATCH/DELETE /events/{id}`, `/publish`, `/unpublish`, `/cancel`, `/archive`, `/unarchive`, `/duplicate`, `/images/{banner                                                                                                | logo}` |
| Agenda & team      | `/events/{id}/speakers`, `/sessions`, `/team`, `/tasks`, `/tasks/checklist`                                                                                                                                                                       |
| Forms              | `GET/POST /forms`, `GET/PATCH/DELETE /forms/{id}`, `PUT /forms/{id}/draft`, `/publish`, `/unpublish`, `/duplicate`, `/versions`                                                                                                                   |
| Public forms       | `GET /public/forms/{slug}`, `POST /public/forms/{slug}/submissions` (JSON) or `/submissions/upload` (multipart)                                                                                                                                   |
| Responses          | `/forms/{id}/submissions` (filters), `/stats`, `/export` (CSV), `/{submissionId}`, `/decision`, `/files/{fileId}`, `/delete`                                                                                                                      |
| Registrations      | `/events/{id}/registrations` (+ `/export`, `/approve`, `/decline`, `/cancel`), `/events/{id}/ticket-types`, `GET /me/registrations`, `/public/registrations/{token}` (+ `/cancel`, `/ticket`)                                                     |
| Attendance         | `POST /events/{id}/check-in/scan`, `/check-in/manual`, `GET /check-in/lookup`, `DELETE /check-in/{registrationId}`, `GET /events/{id}/attendance`                                                                                                 |
| Communications     | `/events/{id}/campaigns`, `PUT /events/{id}/reminder`, `GET /events/{id}/messages`, `/me/email-preferences`, `/public/email-preferences?token=`, `POST /webhooks/brevo?token=`                                                                    |
| Analytics          | `GET /events/{id}/analytics`, `GET /me/organizer-overview`                                                                                                                                                                                        |
| Certificates       | `/events/{id}/certificates` (+ `/template`, `/preview`, `/issue`, `/{id}/revoke`), `GET /public/certificates/{code}` (+ `/pdf`)                                                                                                                   |
| Admin (ADMIN only) | `/admin/stats`, `/admin/users`, `/admin/events/{id}/moderation`, `/admin/reports`, `/admin/organizations`, `/admin/audit-logs`, `/admin/settings`, `/admin/categories`                                                                            |

## Submitting a form (guest)

```http
POST /api/v1/public/forms/{slug}/submissions
Content-Type: application/json

{ "answers": { "full_name": "Ada", "email": "ada@example.org" },
  "idempotencyKey": "<uuid generated once per page load>",
  "versionId": "<versionId from GET /public/forms/{slug}>" }
```

`201` always returns `status: "RECEIVED"`. `message` is the organiser's confirmation only when the response was
accepted; excluded or pending responses get a neutral acknowledgement. `registration` is present when a
registration was created. Retrying with the same `idempotencyKey` returns the same result.
