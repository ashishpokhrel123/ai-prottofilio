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
| AI | Google Gemini (LLM + embeddings) behind provider-agnostic ports |
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

Sign in at `/admin`, then use **Sync GitHub** and **Re-index**.

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
