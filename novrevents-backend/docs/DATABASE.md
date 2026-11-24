# Database

PostgreSQL 17 via Prisma 7 (`prisma/schema.prisma`, migrations in `prisma/migrations`). Conventions:
snake_case tables and columns, UUIDv7 primary keys, every timestamp `timestamptz(3)` stored in UTC.
Events carry an explicit IANA `timezone`.

## Tables

| Area           | Tables                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity       | `users`, `sessions` (token hash only), `auth_tokens` (verification/reset, hash only, single use), `profiles`, `follows`                                                                             |
| Workspaces     | `organizations`, `organization_members`                                                                                                                                                             |
| Events         | `event_categories` (reference data seeded by the first migration), `events`, `event_speakers`, `event_sessions`, `session_speakers`, `event_team_members`, `tasks`, `saved_events`, `event_reports` |
| Forms          | `forms`, `form_versions`, `form_fields`, `form_rules`, `form_submissions`, `submission_answers`                                                                                                     |
| Registration   | `ticket_types`, `registrations`, `tickets`, `check_ins`, `scan_logs`                                                                                                                                |
| Communications | `messages` (outbox + log), `message_campaigns`, `email_preferences` (per address, works for guests), `notifications`                                                                                |
| Other          | `analytics_events`, `certificate_templates`, `certificates`, `audit_logs`, `system_settings`, `jobs`                                                                                                |

## Integrity rules enforced by the database

- Unique: user email, username, event/form slugs, ticket code, certificate code, `(form_id, idempotency_key)`,
  `(form_id, duplicate_hash)`, `check_ins.ticket_id` (one check-in per ticket), `(event_id, reporter_key)`,
  `(form_id, type, session_key)` for analytics beacons.
- CHECK constraints (hand-written in the migrations): lower-case emails/usernames, no self-follow, events and
  sessions end after they start, positive capacities and limits, `qualifying_count <= response_limit`,
  `registered_count <= capacity` for events and ticket types.
- Foreign keys use `CASCADE` for owned children, `SET NULL` for optional references, `RESTRICT` where deleting
  would destroy history (event owner, form owner, the field an answer belongs to, the version a submission answered).

## Counters and transaction boundaries

| Counter                                                    | Maintained in                              | Lock taken                                          |
| ---------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| `forms.qualifying_count`                                   | submission, response deletion              | form row                                            |
| `events.registered_count`, `ticket_types.registered_count` | registration create/approve/decline/cancel | event row, then ticket type row (always this order) |

Submissions are created in one transaction: lock form → re-check open/limit → insert submission and answers →
increment counter → (registration forms) lock event and ticket type → check capacity → create registration and
ticket → queue email → record analytics. Any failure rolls everything back, and uploaded files are deleted.

## Submission states

`qualification`: `QUALIFYING` (no exclusion rule matched) or `EXCLUDED` (stored with `exclusion_reasons`).
`decision`: `PENDING`, `ACCEPTED` (auto or by organiser), `DECLINED`. Only qualifying responses count toward a
response limit; only qualifying registration responses create registrations and tickets.

## Migrations

```bash
npm run db:migrate -- --name <change>   # development: create + apply
npm run db:deploy                        # production: apply pending migrations
```

Never edit an applied migration. Never run `migrate reset` or destructive SQL on a shared database without approval.
The test suite uses a separate database whose name must end in `_test`.

## Phase 1 migration (`20261120120000_phase1_onboarding_consent_contact`)

Additive and nullable. Applied to the development database on 2026-11-20 with `prisma migrate deploy`
after a full backup and row-count check (no row counts changed).

| Table      | Change                                               | Existing rows                                                                                                                                                        |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`    | `onboarded_at`, `terms_accepted_at`, `terms_version` | `onboarded_at` back-filled to `created_at` (all accounts treated as already onboarded). `terms_accepted_at` left NULL: no consent is invented for existing accounts. |
| `profiles` | default of `public_fields` is now `['headline']`     | Unchanged. The default applies to new rows only.                                                                                                                     |
| `events`   | `organizer_email_public` boolean, default `false`    | Defaults to hidden: organiser email no longer appears on public pages until the organiser designates it public.                                                      |

The manual rollback is in `prisma/migrations/20261120120000_phase1_onboarding_consent_contact/rollback.sql`.
Prisma does not run it; take a backup first.

## Phase 2A migration (`20261120150000_phase2a_organization_follows`)

Additive only: one new table, `organization_follows` (follower, organisation, created time), with a composite
primary key (so a repeated follow is a no-op), an index on the organisation, and cascading foreign keys to
`users` and `organizations`. No existing table or row changed. Applied with `prisma migrate deploy` after a
backup (`novrevents-pre-phase2a.dump`) and a row-count check (identical before and after).
The manual rollback is `rollback.sql` in the migration folder.
