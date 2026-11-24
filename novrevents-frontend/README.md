# NOVR Events — Web app

The web app for **NOVR Events**, the cybersecurity event discovery and management platform by
Cybernovr: the marketing site (`/`), event discovery (`/explore`), public event and registration
pages, the signed-in workspace (`/dashboard`) and platform administration (`/admin`).

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Radix primitives with
shadcn/ui conventions · React Hook Form + Zod · TanStack Query · Recharts.
It talks only to the NOVR Events API (separate `novrevents-backend` repository).

## Local development

Requirements: Node.js ≥ 22.12 and the API running locally (see the backend README).

```bash
npm install
cp .env.example .env.local      # API_URL=http://127.0.0.1:4000
npm run dev                     # http://localhost:3100
```

The browser calls `/api/*` on this app and Next.js forwards it to `API_URL`, so the session cookie is
first-party and no CORS configuration is needed.

## Commands

| Command             | Purpose                                                                              |
| ------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`       | Development server on port 3100                                                      |
| `npm run typecheck` | TypeScript check                                                                     |
| `npm run lint`      | ESLint                                                                               |
| `npm test`          | Unit tests (form engine, formatting)                                                 |
| `npm run check`     | All three                                                                            |
| `npm run test:e2e`  | Playwright end-to-end tests (API and web running; `npx playwright install chromium`) |
| `npm run api:sync`  | Copy the backend's `docs/openapi.json` and regenerate `src/lib/api/schema.d.ts`      |
| `npm run build`     | Production build                                                                     |
| `npm start`         | Serve the production build on port 3100                                              |

## Environment

| Variable                     | Required      | Purpose                                                       |
| ---------------------------- | ------------- | ------------------------------------------------------------- |
| `API_URL`                    | Yes           | API origin for the server-side `/api` rewrite (never exposed) |
| `NEXT_PUBLIC_APP_URL`        | Production    | Canonical origin for metadata, sitemap and robots             |
| `NEXT_PUBLIC_EMAIL_DELIVERY` | No (deferred) | `enabled` once the API delivers email                         |

## Production

Deployed on Vercel at `https://novrevents.com`, with the API at `https://api.novrevents.com`.
Step-by-step instructions: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Design

One light theme: white surfaces, thin neutral borders, Inter, and Cybernovr purple for primary actions
and selection. Tokens live in `src/app/globals.css`; see [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).
The Cybernovr logo is the official artwork in `public/brand/`.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Features](docs/FEATURES.md) · [Security](docs/SECURITY.md) ·
[Design system](docs/DESIGN_SYSTEM.md) · [Deployment](docs/DEPLOYMENT.md)
