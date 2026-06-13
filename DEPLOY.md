# Deploying Don't Go Blind (free, for judges)

The whole app — Next.js UI **and** the Nest API — ships as **one Docker container**.
The browser talks only to the web origin; Next proxies API calls to the API process
inside the same container, so judges only ever need **one URL** and there's no CORS
to configure.

## What's in the box

| File | Purpose |
|------|---------|
| `Dockerfile` | Builds `@dgb/shared` → `@dgb/api` → `@dgb/web`, runs as one image. |
| `docker-entrypoint.sh` | Runs Prisma migrations, then starts the API (`:3001`) + web (`:$PORT`). |
| `render.yaml` | Render Blueprint: one free Docker web service + env vars. |
| `.dockerignore` | Keeps secrets/`node_modules`/DB files out of the build context. |

## Deploy to Render (recommended, free)

1. Push this repo to GitHub.
2. Render Dashboard → **New** → **Blueprint** → select the repo. It reads `render.yaml`.
3. When prompted for the `sync:false` env vars, set **at least one** LLM key:
   - `ANTHROPIC_API_KEY` (and/or `OPENAI_API_KEY`)
   - `BRAVE_SEARCH_API_KEY` only if you switch `TOOL_MODE` to `network`.
4. **Create** → wait for the build. Your URL is `https://dont-go-blind.onrender.com`
   (Render may append a suffix if the name is taken — use whatever the dashboard shows).
5. Share that single URL with the judges.

### Free-tier behavior to expect
- The service **sleeps after ~15 min idle**; the first request cold-starts (~50s).
  Hit the URL yourself a minute before the judges to warm it.
- SQLite lives on the **ephemeral** container disk — review history resets on every
  redeploy/restart. That's fine for a demo. To persist it, attach a Render disk and
  point `DATABASE_URL` at a file on the mount (e.g. `file:/var/data/dgb.db`).

## Run the same image anywhere

```bash
docker build -t dont-go-blind .
docker run -p 10000:10000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  dont-go-blind
# open http://localhost:10000
```

`PORT` defaults to `10000`; set `-e PORT=8080 -p 8080:8080` to change it.

## Security notes
- No secrets are baked into the image — `.dockerignore` excludes `.env*` and the build
  only bakes `NEXT_PUBLIC_API_BASE_URL=""` (empty, so the UI uses same-origin paths).
- LLM keys are read from the server-side environment at runtime and never sent to the
  browser (the UI only picks `anthropic` vs `openai`).
- `TOOL_MODE=model_only` (the default here) keeps the API from making outbound web
  calls during a review.
