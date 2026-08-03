# Ashish Pokhrel — Agentic RAG AI Portfolio

> **Don't read my portfolio. Ask it anything.**
> The portfolio *is* an AI assistant. Visitors chat with an autonomous agent that reasons over a vector knowledge base (resume, projects, GitHub, docs) and answers with grounded, cited responses.

![stack](https://img.shields.io/badge/stack-Next.js%2015%20%7C%20NestJS%20%7C%20pgvector-informational)
![tests](https://img.shields.io/badge/tests-345%20passing-success)

---

## What it does

- **Agentic RAG** — a five-stage pipeline (detect → plan → act → reflect → synthesize) that chooses tools before answering.
- **12 tools** — resume, project search, GitHub, document search, knowledge search, job-description analyzer with a real match score, skills, experience, contact, calculator, current time, recommendations.
- **Anti-hallucination** — retrieval-grounded, citation-enforced, confidence-gated. If it doesn't know, it says so.
- **Hybrid retrieval** — pgvector cosine ANN fused with full-text search via Reciprocal Rank Fusion, then re-ranked and context-compressed.
- **Conversation memory** — resolves pronouns ("how was *it* deployed?") across turns.
- **Streaming** — token-by-token over SSE, with an opt-in Socket.IO transport sharing the same agent and falling back to SSE when the gateway isn't there.
- **Grounded cards** — project and skill answers render the retrieved rows as cards, not just prose, so a repo link can't be hallucinated.
- **Ingestion pipeline** — upload PDF/DOCX/MD/TXT/JSON/CSV/images (OCR) → extract → chunk → embed → store.
- **Admin console** — upload documents, sync GitHub, extract skills, re-index, view analytics.

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind, Framer Motion, Zustand |
| Backend | NestJS, Prisma, PostgreSQL + **pgvector**, Redis, BullMQ, Passport JWT, argon2, Swagger |
| AI | Google Gemini or NVIDIA NeMo/Nemotron (LLM + embeddings + reranking) behind provider-agnostic ports |
| Infra | Docker Compose (Caddy, Postgres, Redis), GitHub Actions CI, pnpm + Turborepo |

---

## Architecture

The backend follows **hexagonal architecture** (ports and adapters). The application core — agent, retrieval, ingestion — depends only on interfaces:

```
apps/api/src/
├─ core/                    # No framework, no vendor SDK, no Prisma
│  ├─ ports/                # LlmPort, EmbeddingPort, VectorStorePort,
│  │                        # FileStoragePort, JobQueuePort
│  └─ errors/               # Domain errors, mapped to HTTP at the edge
│
├─ infrastructure/          # The only place vendors are named
│  ├─ llm/gemini.adapter.ts       → LlmPort + EmbeddingPort
│  ├─ vector/pgvector.store.ts    → VectorStorePort
│  ├─ storage/local-file.storage  → FileStoragePort
│  ├─ queue/{bullmq,inline}.queue → JobQueuePort
│  └─ persistence/prisma.service.ts
│
├─ lib/                     # The AI core — depends on ports only
│  ├─ agent/                # intent detector → planner → executor → synthesizer
│  ├─ retriever/            # hybrid search, re-ranking, context compression
│  ├─ embeddings/           # chunker, extractor, ingestion pipeline
│  ├─ tools/                # 12 agent tools + registry
│  └─ memory/, prompts/
│
├─ modules/                 # HTTP/WS boundary: controllers, DTOs, guards
└─ common/config/           # Zod-validated env → typed AppConfigService
```

**Why the indirection earns its keep:** swapping Gemini for OpenAI, or pgvector for Qdrant, is one new adapter file — the agent doesn't change. The same property makes the agent testable with in-memory stubs: the whole suite runs with no database, no network, and no mocking framework.

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full design, **[DEPLOYMENT.md](./DEPLOYMENT.md)** for deploying, and **[docs/API.md](./docs/API.md)** for the API reference.

---

## Quick start

Everything runs in Docker. The only prerequisite is Docker itself.

```bash
cp .env.example .env
```

Set these before starting — the API refuses to boot without the first, and the seed refuses to run without the second:

```bash
JWT_SECRET=$(openssl rand -base64 48)   # 32+ chars enforced in production
ADMIN_PASSWORD=<12+ characters>
GEMINI_API_KEY=<your key>               # optional; without it the agent says so
```

```bash
docker compose -f docker/docker-compose.yml up -d --build

docker compose -f docker/docker-compose.yml exec api \
  node node_modules/prisma/build/index.js db seed
```

Open **http://localhost** and ask it anything.

> Skipping the seed is the most common first-run problem: the admin login fails and most tools return nothing, because there is no data to read.

### Developing on the host

For hot reload, run only the datastores in Docker:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml \
  up -d postgres redis

pnpm install
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev          # web :3000, api :4000, docs at /api/docs
pnpm worker       # separate terminal — or uploads sit at PENDING
```

### Index your content

**Order matters, and every step is required.** Nothing in `knowledge/` reaches
the assistant on its own — the seed registers those files as `PENDING`
documents, and only the index step turns them into embeddings. Skip either and
the site works but the agent answers "I don't have that in my knowledge base
yet" to everything, because that is literally true.

```bash
# 1. Register knowledge/ as documents and copy the files into UPLOAD_DIR.
#    Check afterwards: apps/api/uploads/ should be non-empty.
pnpm db:seed

# 2. Start the API and the ingestion worker. Without the worker, documents
#    sit at PENDING forever and the admin panel looks stuck.
pnpm dev
pnpm worker        # separate terminal

# 3. Sync GitHub, then Re-index — both from /admin.
#    Re-index only queues PENDING and FAILED documents, which is why it is
#    safe to re-run and why it reports "queued: 0" when everything is INDEXED.
```

A quick way to tell which step was missed:

| Symptom | Cause |
|---|---|
| `apps/api/uploads/` is empty | the seed never ran |
| Documents stuck at `PENDING` | the worker isn't running |
| `github_tool` says "not synced yet" | Sync GitHub hasn't run |
| Chat cites nothing, tools return empty | Re-index hasn't run |

> **The résumé download is separate.** `resume_tool` answers from indexed text,
> but the **CV** button streams a real PDF, and `knowledge/resume/` currently
> holds only `about.md`. Drop a PDF in there and set `RESUME_PATH`, or upload
> one from `/admin` — otherwise that button 404s while chat answers fine.

Local admin login can be skipped entirely with `AUTH_DEV_BYPASS=true` and
`NEXT_PUBLIC_AUTH_DEV_BYPASS=true`. Both are dev-only; the env schema refuses
to start a production build with either set.

### Switching to NVIDIA NIM

The LLM and embedding ports are bound by `LLM_PROVIDER`, so the swap is
configuration rather than code. Get a free key at
[build.nvidia.com](https://build.nvidia.com) — no card, ~40 req/min.

Prove the endpoint answers before changing anything the app depends on:

```bash
pnpm --filter @ai-portfolio/api nvidia:smoke
```

It checks the model catalogue, the embedding width against
`EMBEDDING_DIMENSIONS`, the ranking response shape, and a streamed completion.

Then, in one change:

```bash
# .env
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-...
EMBEDDING_DIMENSIONS=2048     # nemotron-3-embed-1b; the API refuses to boot on a mismatch

# stop the API first — this drops every vector.
# DIRECT_URL, not DATABASE_URL: on Neon the latter is the pooled endpoint, and
# PgBouncer in transaction mode can split a DDL transaction across backends.
psql "$DIRECT_URL" -f apps/api/prisma/manual/switch-embedding-dimensions.sql
```

Restart, then re-embed — **not** the admin Re-index button:

```bash
pnpm --filter @ai-portfolio/api db:reembed
```

Re-index rebuilds each document from its original upload, so it needs every
source file still sitting in `UPLOAD_DIR`. Restore a database onto a machine
whose `uploads/` is empty — a fresh clone, a new laptop, a container with a
blank volume — and every job fails on a missing file. Since the migration has
already dropped the old vectors by then, that loses the knowledge base with no
way back. `db:reembed` reads the chunk text from Postgres instead and never
touches the filesystem.

Gemini vectors are not convertible to Nemotron ones — there is no space in
which both are meaningful — which is why the old ones are dropped rather than
migrated. Only the vectors go; the chunk text stays.

Check the state at any point with `pnpm --filter @ai-portfolio/api db:doctor`.

On a **first run** the order is: key → smoke test → migration → `pnpm db:seed`
→ `pnpm dev` + `pnpm worker` → Sync GitHub → Re-index. The migration comes
before the seed only because the API refuses to boot while
`EMBEDDING_DIMENSIONS` and the `vector(n)` column disagree, and everything
after it needs the API up.

Cross-encoder re-ranking is a separate switch, useful even while the rest of
the stack stays on Gemini:

```bash
RAG_RERANK_PROVIDER=nvidia    # adds ~200ms/query, falls back to lexical on failure
```

**On licensing:** the hosted endpoint is for development, testing and
evaluation. Production means either NVIDIA AI Enterprise or self-hosting the
weights, which the NVIDIA Open Model License permits commercially. The adapter
speaks the OpenAI-compatible wire format precisely so that move is a change to
`NVIDIA_BASE_URL` — point it at a NIM container or vLLM server and nothing else
changes.

---

## Troubleshooting

**`Module '"@prisma/client"' has no exported member 'PrismaClient'`** (and dozens of
`Property 'x' does not exist on type 'PrismaService'` errors)

The Prisma client is *generated* code, not a shipped package — it doesn't exist
until `prisma generate` runs. Every one of those errors disappears once it does:

```bash
pnpm db:generate
```

This normally happens automatically via the API's `postinstall` hook. It gets
skipped if you installed with `--ignore-scripts`, so if in doubt:

```bash
pnpm install          # runs postinstall → prisma generate
```

`pnpm dev`, `pnpm typecheck`, and `pnpm build` all run `prisma generate` first,
so a stale or missing client repairs itself.

**Anything importing `@prisma/client` fails at runtime after `pnpm prune --prod`**

Pruning rebuilds `node_modules` and drops the generated client with it. Re-run
`prisma generate` after pruning — `docker/api.Dockerfile` does exactly this.

---

## Making it yours

Everything the agent knows comes from two places:

1. **`knowledge/`** — markdown/text files (resume, projects, blogs). Chunked and embedded. Samples are marked `> SAMPLE`; replace them.
2. **`apps/api/prisma/seed.ts`** — structured records (projects, skills, experience) used by the deterministic tools.

Drop your resume PDF at `knowledge/resume/ashish-pokhrel-resume.pdf` for the download endpoint, and set `GITHUB_USERNAME` to pull in repositories.

The agent will **never** state anything not present in this content.

---

## Quality

```bash
pnpm verify      # lint + typecheck + test + build
pnpm test        # 271 unit tests
pnpm test:e2e    # 43 end-to-end HTTP tests
pnpm format      # prettier
```

CI runs formatting, lint, typecheck, tests, build, and both Docker image builds on every push.

**Security posture:** argon2id password hashing with transparent legacy migration · fail-fast environment validation (a weak `JWT_SECRET` or an enabled auth bypass blocks a production boot) · fully parameterised SQL · CORS allow-list · helmet · per-route rate limiting · non-root containers · 5xx details never returned to clients.

---

## Deployment

The entire stack is Docker — Postgres, Redis, the API, the ingestion worker, the Next.js app, and a Caddy reverse proxy that terminates TLS and serves both apps from one origin.

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

Set `DOMAIN` and Caddy provisions HTTPS automatically. Only the proxy publishes ports; Postgres and Redis stay on the internal network.

Serverless hosting isn't an option here: the BullMQ worker, the Socket.IO gateway, file uploads and OCR all need a long-lived process with a writable filesystem. Full walkthrough in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.
