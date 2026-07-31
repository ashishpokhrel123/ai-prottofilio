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

The web client hedges regardless — `streamChat` uses SSE by default and treats
the Socket.IO gateway as opt-in (`NEXT_PUBLIC_CHAT_TRANSPORT=socket`), so a
host without a long-lived process costs nothing rather than a failed connection
per visitor.

---

## Split deploy: web on Vercel, API on a host

The frontend is a plain Next.js app and deploys to Vercel cleanly. Only the API
needs a real host. `vercel.json` at the repo root pins this:

```json
{
  "buildCommand": "turbo run build --filter=@ai-portfolio/web",
  "outputDirectory": "apps/web/.next"
}
```

**The filter is the load-bearing part.** Without it `turbo run build` walks the
whole workspace and tries to build the NestJS app, which fails on Vercel with
`nest: command not found` — `@nestjs/cli` is a devDependency and Vercel skips
devDependencies when `NODE_ENV=production` is set on the project. Nothing in
`apps/web` needs that build: `@ai-portfolio/shared` is consumed as TypeScript
source (`main: ./src/index.ts`, no build step) via `transpilePackages`.

Leave **Root Directory empty** in the project settings — `vercel.json` already
scopes the build, and setting both fights itself.

### Environment

On **Vercel**, set only what the browser needs:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.example.com` — where the API actually runs |
| `NEXT_PUBLIC_CHAT_TRANSPORT` | `socket` to use the WebSocket gateway, otherwise omit |

Nothing else. `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` and `GEMINI_API_KEY`
belong to the API — setting them on the Vercel project puts backend secrets in
a frontend build environment for no benefit, and Turbo will warn that they are
undeclared rather than pass them through.

On the **API host**, the browser is now cross-origin, so the API has to admit
it:

```bash
APP_URL=https://your-app.vercel.app      # also the Socket.IO gateway's CORS origin
CORS_ORIGINS=https://your-app.vercel.app # add preview domains here too
```

Preview deployments get a new URL per branch, so either add them to
`CORS_ORIGINS` or accept that only production talks to the API.

### What you give up

The single-origin property from the Caddy setup. With both apps behind one
proxy there is no CORS, no API URL in the client bundle, and no preflight on
each request. Split across two hosts you pay a preflight per chat turn and the
API origin is public. Workable, but the container deploy below is simpler.

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
