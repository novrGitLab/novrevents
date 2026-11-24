# Frontend architecture

## Data flow

```
React page ─► TanStack Query ─► openapi-fetch client (typed from openapi/openapi.json)
                                   │  same-origin /api/v1/...  (+ X-CSRF-Token on mutations)
                                   ▼
                     next.config.ts rewrite ─► API_URL/api/v1/...
```

- **No server state in components.** Every server read is a `useQuery` with a key from `src/lib/api/keys.ts`;
  mutations invalidate the keys they affect.
- **Typed contract.** `src/lib/api/schema.d.ts` is generated from the backend's OpenAPI document; requests and
  responses are type-checked against it. A contract change shows up as a TypeScript error.
- **Errors** are normalised to `ApiError` (`src/lib/api/errors.ts`) and shown with `errorMessage()`; field errors
  map onto forms with `applyFieldErrors()`.
- **Session.** `useSession()` reads `GET /auth/session`; its CSRF token is handed to the API client. The cookie
  itself is HTTP-only and never touched by scripts.

## Routes

| Group       | Layout                               | Pages                                                                                                                                                                                  |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(site)`    | public header/footer                 | home, explore, event detail, public form `/f/[slug]`, guest ticket `/r/[token]`, profile `/u/[username]`, organiser `/o/[slug]`, certificate verification, unsubscribe, privacy, terms |
| `(auth)`    | minimal                              | login, register, forgot/reset password, verify email                                                                                                                                   |
| `dashboard` | app shell, redirects anonymous users | overview, tickets, registrations, saved, following, events (+ per-event workspace with 12 tabs), forms (+ builder, responses), organisations, profile, notifications, settings         |
| `admin`     | app shell, ADMIN only                | overview, users, events, reports, organisations, audit log, configuration                                                                                                              |

Event workspace tabs: overview, details & branding, forms, registrations & ticket types, check-in scanner,
attendance, agenda & speakers, tasks & checklist, messages, analytics, certificates, team. Tabs are hidden by role
(check-in staff see only what they can use); the API enforces the same rules.

## Form engine

`src/lib/form-engine` is the backend engine copied verbatim (`npm`-free script: `node scripts/sync-engine.mjs`).
The renderer (`components/forms/form-renderer.tsx`) and the builder preview use it to show/hide questions,
apply conditional requirements and validate each step. `engine.test.ts` mirrors the backend engine tests.

## QR scanning

`components/attendance/qr-scanner.tsx` uses `getUserMedia` and the native `BarcodeDetector` where available,
falling back to `jsQR` on a canvas. Only the decoded text is sent to the API, which verifies the signature and
decides the outcome. Camera access requires HTTPS (or localhost).

## Design system

shadcn/ui-style components in `src/components/ui` (Radix primitives, `cva`, Tailwind). Semantic colour tokens in
`globals.css` (`primary`, `brand`, `muted`, `success`, `warning`, `destructive`, `chart-1…5`). System font stacks
(no third-party font requests). Reduced-motion respected globally.
