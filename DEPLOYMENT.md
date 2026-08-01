# Deployment

The whole stack runs in Docker. One command, one host, no external services.

```bash
cp .env.example .env      # set JWT_SECRET, ADMIN_PASSWORD, GEMINI_API_KEY
docker compose -f docker/docker-compose.yml up -d --build
```

Then open **http://localhost**.

## Why not Vercel

Streaming is no longer the reason. Vercel Functions serve [WebSockets on Fluid
compute](https://vercel.com/docs/functions/websockets) — Socket.IO included —
and [stream responses](https://vercel.com/docs/functions/streaming-functions)
well past the old edge ceiling. Either transport in `apps/api/src/modules/chat`
would work there.

What still doesn't fit is everything around the request:

| Requirement | Why serverless breaks it |
|---|---|
| **BullMQ ingestion worker** | A process that consumes a queue indefinitely. Functions are invoked, not run. |
| **File uploads** | The filesystem is read-only apart from `/tmp`, wiped between invocations. |
| **OCR (`tesseract.js`)** | Tens of megabytes of native workers plus a long runtime, on every cold start. |
| **Redis + Postgres** | Both become paid third-party add-ons with their own connection limits. |

So the split is real but narrower than "serverless can't stream": the chat path
is portable, the ingestion path is not. Containers keep both working on one
host, and the architecture stays worth showing.

If you want a public URL without paying for a host anyway, both apps *do* run
on Vercel — see [Everything on Vercel](#everything-on-vercel). The ingestion
path returns 503 there by design, and content goes in through the seed instead.

The web client hedges regardless — `streamChat` uses SSE by default and treats
the Socket.IO gateway as opt-in (`NEXT_PUBLIC_CHAT_TRANSPORT=socket`), so a
host without a long-lived process costs nothing rather than a failed connection
per visitor.

---

## Everything on Vercel

Two Vercel projects, one repo, different **Root Directory** settings. The web
project builds `apps/web`; the API project builds `apps/api` and serves the
whole Nest app from a single Function.

This works, and it is the cheapest way to get a public URL. It costs you the
ingestion pipeline — see [What breaks](#what-breaks-and-why) before committing
to it.

### 1. Provision Postgres

Vercel dashboard → **Storage** → **Marketplace** → **Neon**. Connect it to both
projects; Vercel injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.

Prisma needs two URLs and calls the second one `DIRECT_URL`, so add it by hand
on the API project:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the **pooled** endpoint (`...-pooler.neon.tech`) — what the Function uses |
| `DIRECT_URL` | the **unpooled** endpoint — what `prisma migrate` uses |

The pooler is not optional. Every concurrent Function invocation opens its own
connection, and Postgres runs out long before Vercel does.

Then enable the extensions the schema declares, from the Neon SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Skip Redis.** Upstash is on the same Marketplace page and it is tempting, but
`REDIS_URL` only tells the API to *enqueue* ingestion jobs onto BullMQ — the
thing that *consumes* them is `apps/api/src/workers/ingestion.worker.ts`, a
process that runs forever, which is precisely what Vercel does not offer. Set
it and uploads report success while documents sit at `PENDING` indefinitely.
Leave it unset and the API says so at boot. Only add Redis if you run that
worker somewhere else.

### 2. Deploy the API project

New project from the repo, then:

- **Root Directory**: `apps/api`
- **Include files outside of the Root Directory**: on (it needs
  `packages/shared` and the workspace lockfile)

`apps/api/vercel.json` handles the rest:

```json
{
  "installCommand": "pnpm install --prod=false",
  "buildCommand": "pnpm run build",
  "outputDirectory": "dist"
}
```

There is no serverless handler and no `api/` directory. Vercel's Node.js
preset builds the project, looks inside the output directory for a server
entrypoint, and runs it — `nest build` emits `dist/src/main.js`, which is one
of the names it searches for. `main.ts` runs unmodified; the platform assigns
a port and the process binds it.

**`outputDirectory` must be `dist`, not the app root.** Point it at the root
and the same search finds `src/main.ts` — the TypeScript source — which Vercel
compiles with esbuild. esbuild does not emit `design:paramtypes`, the metadata
Nest reads to resolve constructor dependencies, so the build succeeds and every
request then fails with "Nest can't resolve dependencies". Compiling with tsc
via `nest build` and pointing at the output keeps the decorator metadata
intact.

The port comes from the host. `PORT` is in the env schema and takes precedence
over `API_PORT`, because Vercel, Railway, Render and Fly all choose a port and
expect the process to bind the one they chose — binding 4000 instead means the
health check never succeeds and the deploy is marked failed.

`--prod=false` is load-bearing. pnpm reads `NODE_ENV` and skips
devDependencies when it is `production`, which Vercel sets during the build.
`@nestjs/cli` and `typescript` are devDependencies, so without the flag the
build gets as far as `prisma generate` — `prisma` is a runtime dependency, so
it survives — and then dies on:

```
sh: line 1: nest: command not found
```

The asymmetry is the tell: if Prisma runs and Nest doesn't, devDependencies
are missing, not the PATH.

Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled URL |
| `DIRECT_URL` | Neon unpooled URL |
| `JWT_SECRET` | `openssl rand -base64 48` — 32+ chars is enforced in production |
| `GEMINI_API_KEY` | your key |
| `APP_URL` | the web project's URL, e.g. `https://your-app.vercel.app` |
| `CORS_ORIGINS` | same, plus any preview domains |
| `GITHUB_TOKEN`, `GITHUB_USERNAME` | optional, for the GitHub sync tool |

**Do not set `NODE_ENV=production` as a project variable.** Vercel already sets
it at runtime; setting it yourself makes the *install* step skip
devDependencies, and `@nestjs/cli` is one — the build then dies on
`nest: command not found`. Leave `AUTH_DEV_BYPASS` unset too; the env schema
rejects it in production, but there is no reason to find that out from a failed
deploy.

### 3. Migrate and seed

Both run from your machine against the Neon database — there is no shell on
Vercel:

```bash
export DATABASE_URL='<neon pooled url>'
export DIRECT_URL='<neon unpooled url>'

pnpm db:migrate   # prisma migrate deploy
pnpm db:seed      # admin user + baseline skills, projects, experience
```

The seed is not optional. Without it the admin login fails and most agent tools
return nothing, because there is no data behind them.

Confirm the API is alive before wiring the frontend to it:

```bash
curl https://<api-project>.vercel.app/api/v1/health/ready
```

That endpoint names each dependency it checked, so a failure tells you which
one rather than just returning 503.

### 4. Deploy the web project

A second project from the same repo, with **Root Directory** `apps/web` and
**Include files outside of the Root Directory** on.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<api-project>.vercel.app` |

Leave `NEXT_PUBLIC_CHAT_TRANSPORT` unset. `streamChat` then uses SSE, which
works fine. The Socket.IO gateway needs a connection that outlives a single
invocation; instances here are frozen between requests, so a long-lived socket
is not something to rely on.

Nothing else belongs here. `DATABASE_URL`, `JWT_SECRET` and `GEMINI_API_KEY`
are API secrets; putting them in a frontend build environment gains nothing and
Turbo will warn that they are undeclared rather than pass them through.

Then go back and set `APP_URL` and `CORS_ORIGINS` on the API project to this
project's URL. Preview deployments get a fresh URL per branch, so either add
them to `CORS_ORIGINS` or accept that only production talks to the API.

### What breaks, and why

Vercel runs the Nest process, but it is not a container: the instance is frozen
between requests and replaced without warning, and the filesystem is read-only
apart from `/tmp`. That costs three things, enforced in code rather than left
to fail at runtime — `buildConfig` detects `VERCEL=1` and the composition root
binds `UnavailableFileStorage` instead of `LocalFileStorage`.

| Capability | Result on Vercel |
|---|---|
| **Document upload** (`POST /api/v1/documents/upload`) | 503 with an explanation. Nothing writable survives to the moment the ingestion job would read it back. |
| **Reindex** (`POST /api/v1/documents/:id/reindex`) | 503. It re-reads the stored source file, which was never stored. |
| **OCR** (`tesseract.js`) | Unreachable — it sits behind ingestion. Tens of MB of native workers on every cold start would not be worth reaching anyway. |

Everything else works: chat and streaming, retrieval over already-embedded
chunks, projects, resume, skills, GitHub sync, auth, analytics. Content gets in
through `pnpm db:seed` rather than the admin uploader.

The failure is deliberately loud. A 503 that says *why* is worth more than an
upload that returns 201 and quietly never embeds anything.

To get ingestion back, the ports are already the right shape: bind
`FILE_STORAGE_PORT` to a Vercel Blob or S3 adapter, and move the job onto
something that runs — Vercel Cron, QStash, or the existing BullMQ worker on a
container host.

### What you also give up

The single-origin property of the Caddy setup. Behind one proxy there is no
CORS, no API URL in the client bundle, and no preflight per request. Across two
Vercel projects you pay a preflight per chat turn and the API origin is public.

---

## Alternative: web on Vercel, API on a container host

Same web project as above, but the API runs as a container on Railway, Render
or Fly. Nothing breaks — uploads, OCR and the BullMQ worker all work, because
there is a real filesystem and a real long-lived process. Costs a few dollars a
month.

The web-project setup is identical. Set **Root Directory** to `apps/web` and tick
**"Include files outside of the Root Directory"** so `packages/shared` is still
part of the build context.

Root Directory is not cosmetic. Vercel detects the framework by reading the
`package.json` it finds there, and the root `package.json` of this workspace
only holds `prettier`, `turbo` and `typescript`. Point it at the repo root and
the deploy dies before it builds anything:

```
Error: No Next.js version detected. Make sure your package.json has "next"
in either "dependencies" or "devDependencies".
```

With the root directory correct, `apps/web/vercel.json` needs nothing but the
framework — Vercel installs from the workspace root (it reads
`pnpm-workspace.yaml`) and runs `next build` inside `apps/web`:

```json
{
  "framework": "nextjs"
}
```

**Do not add `outputDirectory`.** Paths in `vercel.json` resolve against the
Root Directory, so the old `apps/web/.next` now means
`apps/web/apps/web/.next`. The default already finds `.next`.

**Do not add `buildCommand: turbo run build` without a filter** either. Bare
`turbo run build` walks the whole workspace and tries to build the NestJS app,
which fails with `nest: command not found` — `@nestjs/cli` is a devDependency
and Vercel skips devDependencies when `NODE_ENV=production` is set on the
project. Running `next build` directly sidesteps this: nothing in `apps/web`
needs the API build, and `@ai-portfolio/shared` is consumed as TypeScript
source (`main: ./src/index.ts`, no build step) via `transpilePackages`.

> The leftover `vercel.json` at the repo root is dead config — Vercel only
> reads the one inside the Root Directory. Delete it when convenient; leaving
> it around just means the "No Next.js version detected" failure comes back if
> anyone ever clears the Root Directory setting.

### Environment

On the **web project**, set only what the browser needs:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.example.com` — where the API actually runs |
| `NEXT_PUBLIC_CHAT_TRANSPORT` | `socket` to use the WebSocket gateway, otherwise omit |

A container host keeps a process alive, so `socket` is a real option here in a
way it is not on Vercel.

On the **API host**, the browser is now cross-origin, so the API has to admit
it:

```bash
APP_URL=https://your-app.vercel.app      # also the Socket.IO gateway's CORS origin
CORS_ORIGINS=https://your-app.vercel.app # add preview domains here too
```

Preview deployments get a new URL per branch, so either add them to
`CORS_ORIGINS` or accept that only production talks to the API.

---

## What the stack contains

```
                      ┌─────────────┐
        :80/:443  →   │    caddy    │  TLS, one origin, no CORS
                      └──────┬──────┘
                    /api/*   │   everything else
                  ┌──────────┴──────────┐
                  ▼                     ▼
             ┌─────────┐          ┌─────────┐
             │   api   │          │   web   │  Next.js standalone
             └────┬────┘          └─────────┘
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
  ┌─────────┐ ┌───────┐ ┌────────┐
  │ postgres│ │ redis │ │ worker │  BullMQ ingestion
  │ pgvector│ └───────┘ └────────┘
  └─────────┘
```

**Only Caddy publishes ports.** Postgres and Redis are reachable solely on the internal network — they are never exposed to the host, let alone the internet.

Because Caddy serves both apps from one origin, the browser is always same-origin: no CORS, no API URL baked into the client bundle, and SSE/WebSocket upgrades pass through a real proxy rather than an edge function.

---

## Production

### 1. Configure

```bash
cp .env.example .env
```

Required — the API refuses to start without them:

```bash
JWT_SECRET=$(openssl rand -base64 48)   # 32+ chars enforced in production
POSTGRES_PASSWORD=<something strong>
ADMIN_PASSWORD=<12+ characters>
GEMINI_API_KEY=<your key>
```

For HTTPS, add your hostname. Caddy then provisions a Let's Encrypt certificate on first boot:

```bash
DOMAIN=portfolio.example.com
ACME_EMAIL=you@example.com
APP_URL=https://portfolio.example.com
```

Point the domain's A record at the host and open ports 80 and 443 first — the ACME challenge needs both.

### 2. Start

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

Migrations run automatically before the API accepts traffic.

### 3. Seed

```bash
docker compose -f docker/docker-compose.yml exec api \
  node node_modules/prisma/build/index.js db seed
```

This creates the admin user and the baseline skills, projects and experience. **Without it the admin login fails and most agent tools return nothing** — they have no data to read.

### 4. Index your content

Sign in at `/admin`, then **Sync GitHub** and **Re-index**.

---

## Operations

```bash
# Follow logs
docker compose -f docker/docker-compose.yml logs -f api worker

# Health
curl localhost/api/v1/health          # liveness
curl localhost/api/v1/health/ready    # readiness, names each dependency

# Update to the latest code
git pull && docker compose -f docker/docker-compose.yml up -d --build

# Back up the database
docker compose -f docker/docker-compose.yml exec postgres \
  pg_dump -U portfolio ai_portfolio > backup-$(date +%F).sql
```

### Persistent volumes

| Volume | Holds | Losing it means |
|---|---|---|
| `postgres-data` | All content, chunks, embeddings | Total data loss — back this up |
| `uploads` | Uploaded source documents | Re-index becomes impossible |
| `redis-data` | Queued ingestion jobs | Pending jobs are dropped |
| `caddy-data` | TLS certificates | Certificates are re-requested (rate limited) |

---

## Local development

Run only the datastores in Docker and the apps on the host, for hot reload and a debugger:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml \
  up -d postgres redis

pnpm install
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev          # web :3000, api :4000
pnpm worker       # separate terminal — required, or uploads sit at PENDING
```

Or run the full containerised stack exactly as production does:

```bash
docker compose -f docker/docker-compose.yml up --build
```

---

## Troubleshooting

**Admin login fails / tools say "I don't have that in my knowledge base"**
The database is empty. Run the seed (step 3). Login is also rate limited to 5 attempts a minute — if you have been retrying, wait 60 seconds.

**Uploaded documents stay at `PENDING`**
The worker isn't running. `docker compose ps` should list `worker` as up; locally you need `pnpm worker` in its own terminal.

**Caddy cannot get a certificate**
`DOMAIN` must resolve to this host, and ports 80 and 443 must be reachable from the internet. Test with the staging CA first (see the commented `acme_ca` line in `docker/Caddyfile`) to avoid Let's Encrypt rate limits.

**`prisma generate` errors after pulling changes**
`pnpm install` runs it via `postinstall`; `pnpm db:generate` forces it.

---

## Pre-deploy checklist

```bash
pnpm verify   # lint + typecheck + test + build
```

- [ ] `JWT_SECRET` is 32+ random characters, not a placeholder
- [ ] `POSTGRES_PASSWORD` changed from the default
- [ ] `ADMIN_PASSWORD` is 12+ characters
- [ ] `AUTH_DEV_BYPASS` unset or `false` (the env schema rejects it in production anyway)
- [ ] `DOMAIN` and `APP_URL` match the real hostname
- [ ] Ports 80/443 open; everything else closed
- [ ] A backup job exists for `postgres-data`
