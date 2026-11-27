# NovrEvents production

The web application is served at `https://event.cybernovr.com`. Browser requests use `/api/v1` on that origin. Caddy forwards them to Fastify directly. Server-rendered pages use the private service address. External API clients can use `https://api.event.cybernovr.com/api/v1`. The application containers share a dedicated network with Caddy. PostgreSQL has a separate internal network and no host port.

## Runtime

On vmi3761831 the deployment account owns `~/novrevents`. Its `config/database.env` provides POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB. Its `config/api.env` provides DATABASE_URL, SESSION_SECRET, SESSION_COOKIE_NAME, email configuration and optional provider keys. Keep these files readable only by the deployment account. Changing the signing secret invalidates existing QR and private management links. The web cookie is host-only, so people moving to the new domain sign in again.

Use the same Caddy process as NovrPulse. The Events site blocks live in `deploy/Caddyfile.events` and the gateway repository's Caddyfile. Only Caddy, events-web and events-api join `novrevents-edge`. PostgreSQL uses the persistent `novrevents_events-database` volume and uploads use `novrevents_events-uploads`. PostgreSQL 18 mounts its data volume at `/var/lib/postgresql`.

## Build and release

Pull requests and feature branches run the GitHub workflow. The main branch deploy job depends on API build, lint, PostgreSQL integration tests, web build, lint, unit tests, dependency audits and a regenerated contract comparison. The production GitHub environment uses secrets VPS_SSH_KEY and VPS_KNOWN_HOSTS and variables VPS_HOST and VPS_USER. The SSH host key is pinned. Authorize the CI public key with OpenSSH restrict and a forced command pointing at the installed copy of deploy/release.sh. Keep its path owned by the server deployment account.

The runner supplies an ephemeral, read-only repository token over SSH standard input. The release command fetches the fixed repository and accepts only its current main commit. It serializes releases with flock, builds revision-tagged images, takes a PostgreSQL archive before migrations, migrates once, waits for both application health checks and moves the current symlink. An unhealthy rollout attempts to restore the previous application images. Database rollback needs a deliberate restore and a plan for writes received after the snapshot.

## Moving production data

Use the active Railway API service and its referenced PostgreSQL service. Record the source database name, installed PostgreSQL major version, Prisma migration count and actual storage driver. Take a custom-format dump and a tar archive of the configured upload directory. Compare checksums after transfer. Restore into an empty destination with pg_restore --single-transaction --exit-on-error --no-owner --no-acl. Compare row counts for every public-schema table before applying new migrations. Verify archive paths and the regular-file count on the source volume. Keep workers disabled on the staged destination.

Before changing the write destination, stop new writes and jobs on the source, take the final snapshot and compare it to the restoration. Route previous API clients to the same authoritative writer or keep the legacy API offline. Enable background jobs on the destination only after ownership transfers. Keep the old managed database and uploads during the rollback window. A rollback after accepting writes needs reconciliation before redirecting users.

The release command requires a restore-verified marker in the server config directory. Create it after the initial restore and comparison. Subsequent releases back up the live database before migrating. Periodically copy backups off-host and exercise a restore.

## Providers

- In Google Auth Platform, use the **NovrEvents** Web application client. Its authorized redirect URI is `https://event.cybernovr.com/api/v1/auth/google/callback`. The private Events API reads this client's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Google sign-in uses the openid-client library with discovery, PKCE, state, nonce and signed ID token verification. The API issues its own Events session. Existing password users can link a matching verified Google account through Settings. New accounts accept the current policies during enrollment.
- Paystack starts in **test** mode. Store the test public and secret keys and the live public and secret keys separately in the encrypted NovrEvents editor. The deployment selector passes one pair as `PAYSTACK_PUBLIC_KEY` and `PAYSTACK_SECRET_KEY` plus `PAYSTACK_MODE=test|live`. Both prefixes must match the mode. Hosted checkout is initialized and verified by the API. Test checkout is available on unlisted or private events and requires a verified NGN test subaccount. Successful test payments release the hold and display a test receipt. Switching to live is an explicit deployment step. Assign a live subaccount to each organizer before opening paid public sales.
- The worker recovers NovrEvents payment references when a buyer closes checkout. A dedicated Events merchant can send charge notifications to `https://api.event.cybernovr.com/api/v1/payments/paystack/webhook`. Shared merchants can keep their existing webhook. Prices are stored in kobo. The API verifies the reference, provider environment, amount, currency, email, and hold deadline before issuing admission. The admin payment queue surfaces charges requiring manual reconciliation.
- Production uses Gmail SMTP with verified TLS on port 465. Set EMAIL_DRIVER=gmail, EMAIL_FROM_NAME=NovrEvents, EMAIL_FROM_ADDRESS to the approved Gmail mailbox, and GMAIL_APP_PASSWORD to a dedicated app password. Google requires two-step verification for app passwords. The Brevo driver is also supported. Configure EMAIL_DRIVER=brevo, a verified EMAIL_FROM_ADDRESS and BREVO_API_KEY before enabling production email. Without a delivery provider the API can queue messages locally. Password recovery, verification links and emailed tickets require delivery.

- Optional organizer copy drafting uses NHAAI_BASE_URL (HTTPS, including its API version prefix), NHAAI_MODEL and a dedicated NHAAI_API_KEY. Verified organizers can submit their event notes and choose whether to apply the returned description. Drafting is hidden until configured.

## Administrator enrollment

Run `node dist/cli/promote-admin.js <email>` inside the API container. For a new address the command reserves a seven-day invitation. The holder can register with Google using the invited address. For password accounts, the holder can register, then set a new password using the link sent to that mailbox. A qualifying claim consumes the invitation and ends previous sessions. The command grants access immediately to an existing active, verified account. Administrators sign in at `/admin/auth/login`. Run the command again to renew an expired invitation.
