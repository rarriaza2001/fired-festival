# Don't Go Blind — single-container image (Nest API + Next.js web).
#
# The Next.js server serves the UI and proxies /reviews, /attachments, /health
# and /telemetry to the Nest API running on 127.0.0.1:3001 inside this same
# container (see apps/web/next.config.mjs rewrites). Judges only need one URL.
#
# Build once, run anywhere (Render, Fly, Railway, plain `docker run`).

FROM node:20-slim

# openssl: required by the Prisma query engine. ca-certificates + bash: outbound
# HTTPS to the LLM provider and the entrypoint script.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates bash \
  && rm -rf /var/lib/apt/lists/*

# pnpm 10.21.0 comes from the "packageManager" field via corepack.
RUN corepack enable
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# --- Install deps (cached on lockfile + manifests) ---
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Dev deps are needed to build (nest/next/tsc); we keep them — the runtime tier
# is small enough for a demo and this avoids a fragile prune across the workspace.
RUN pnpm install --frozen-lockfile

# --- Build: shared -> api (with prisma client) -> web ---
COPY . .
# The browser must call the web origin (same-origin); empty base = relative URLs
# that hit the Next rewrite proxy. Baked at build time (NEXT_PUBLIC_*).
ENV NEXT_PUBLIC_API_BASE_URL=""
RUN pnpm --filter @dgb/shared build \
  && pnpm --filter @dgb/api exec prisma generate \
  && pnpm --filter @dgb/api build \
  && pnpm --filter @dgb/web build

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Run as the unprivileged "node" user (uid 1000, built into the base image).
# /app/data holds the runtime SQLite DB; pre-create it and hand the whole
# workspace to node so migrations and writes succeed without root.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/data \
  && chown -R node:node /app
USER node

# Render injects PORT (default 10000); the entrypoint binds Next to it.
EXPOSE 10000
ENTRYPOINT ["docker-entrypoint.sh"]
