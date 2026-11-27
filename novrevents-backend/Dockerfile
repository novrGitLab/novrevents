# syntax=docker/dockerfile:1.7
# NOVR Events API — production image (used by Railway; see docs/DEPLOYMENT.md).
#   docker build -t novrevents-api .
# The container starts the API and the background worker. Database migrations are a separate,
# explicit step (`npx prisma migrate deploy`), run by Railway's pre-deploy command.

ARG NODE_VERSION=24-bookworm-slim

# ── Build ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma7.config.ts tsconfig.json tsconfig.build.json ./
RUN npx prisma generate
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma7.config.ts ./

RUN install -d -o node -g node /data/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
