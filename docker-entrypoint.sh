#!/usr/bin/env bash
# Boot both processes in one container: Nest API (internal :3001) + Next.js web
# (public :$PORT). The web proxies API paths to the API (see next.config.mjs).
set -euo pipefail

# Render assigns PORT (default 10000). The web binds it; the API stays internal.
PORT="${PORT:-10000}"
export API_PORT=3001

# SQLite lives on the container's ephemeral disk. Good enough for a demo — data
# resets on redeploy/restart. Override DATABASE_URL to point at a mounted disk
# (e.g. a Render persistent disk) if you need it to survive restarts.
mkdir -p /app/data
export DATABASE_URL="${DATABASE_URL:-file:/app/data/dgb.db}"

echo "[entrypoint] applying database migrations..."
( cd /app/apps/api && pnpm exec prisma migrate deploy )

echo "[entrypoint] starting API on :${API_PORT} (internal)..."
( cd /app/apps/api && node dist/main.js ) &

echo "[entrypoint] starting web on :${PORT} (public)..."
( cd /app/apps/web && node node_modules/next/dist/bin/next start -p "${PORT}" -H 0.0.0.0 ) &

# If either process exits, tear the container down so the platform restarts it.
wait -n
echo "[entrypoint] a process exited; shutting down."
exit 1
