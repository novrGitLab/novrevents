# NOVR Events

The cybersecurity event discovery and management platform by [Cybernovr](https://cybernovr.com).

| Directory                                      | What it is                          | Deployed to | Domain                       |
| ---------------------------------------------- | ----------------------------------- | ----------- | ---------------------------- |
| [`novrevents-frontend/`](novrevents-frontend/) | Next.js 16 web app                  | Vercel      | `https://novrevents.com`     |
| [`novrevents-backend/`](novrevents-backend/)   | Fastify API, PostgreSQL, Prisma     | Railway     | `https://api.novrevents.com` |

The two applications share this repository but are built, configured and deployed independently.
The web app reaches the API only through its REST contract (`/api/v1`), proxied on the web origin.

## Local development

Start the API first, then the web app. Each README has the details.

```bash
cd novrevents-backend  && npm install && cp .env.example .env && npm run services:up && npm run db:deploy && npm run dev
cd novrevents-frontend && npm install && cp .env.example .env.local && npm run dev
```

## Deployment

See [`novrevents-backend/docs/DEPLOYMENT.md`](novrevents-backend/docs/DEPLOYMENT.md) (the same guide
is in `novrevents-frontend/docs/`). Vercel uses root directory `novrevents-frontend`; Railway uses root
directory `novrevents-backend` with config file `/novrevents-backend/railway.json`.

© Cybernovr. All rights reserved.
