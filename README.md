# Ashish Pokhrel — Agentic RAG AI Portfolio

> **Don't read my portfolio. Ask it anything.**
> The portfolio *is* an AI assistant. Visitors chat with an autonomous agent that
> reasons over a vector knowledge base (resume, projects, GitHub, blogs, docs) and
> answers with grounded, cited responses — powered by Google Gemini + PostgreSQL/pgvector.

![status](https://img.shields.io/badge/status-scaffold-blueviolet) ![stack](https://img.shields.io/badge/stack-Next.js%2015%20%7C%20NestJS%20%7C%20pgvector-informational)

---

## ✨ What it does

- **Agentic RAG chat** — a LangGraph-style agent (detect → plan → act → reflect → synthesize) that chooses tools before answering.
- **12 tools** — resume, project search, GitHub, document search, knowledge search, job-description analyzer (with a real match score), skills, experience, contact, calculator, current time, recommendations.
- **Anti-hallucination** — retrieval-grounded, citation-enforced, confidence-gated. If it doesn't know, it says so.
- **Hybrid retrieval** — pgvector cosine ANN fused with full-text keyword search (RRF), then re-ranked and context-compressed.
- **Conversation memory** — resolves pronouns ("how was *it* deployed?") across turns.
- **Streaming** — token-by-token over SSE (and Socket.IO).
- **Ingestion pipeline** — upload PDF/DOCX/MD/TXT/JSON/CSV/images (OCR) → extract → chunk → embed → store, in a background BullMQ worker.
- **Admin console** — upload docs, sync GitHub, re-index, view analytics.

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full design and **[docs/API.md](./docs/API.md)** for the API.

---

## 🧱 Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind, Framer Motion, React Query, Zustand |
| Backend | NestJS, Prisma, PostgreSQL + **pgvector**, Redis, BullMQ, Passport JWT, Swagger, CQRS-ready |
| AI | Google **Gemini 2.5 Pro** (LLM), Gemini embeddings, custom LangGraph-style agent |
| Infra | Docker + Docker Compose, GitHub Actions CI, pnpm + Turborepo |

---

## 📁 Monorepo layout

```
ai-portfolio/
├─ apps/
│  ├─ web/                 # Next.js 15 frontend (hero + ChatGPT-style chat + admin)
│  └─ api/                 # NestJS backend
│     ├─ prisma/           # schema.prisma, pgvector migration, seed
│     └─ src/
│        ├─ common/        # config, prisma, redis, queue, filters
│        ├─ modules/       # auth, chat, documents, embeddings, projects,
│        │                 # skills, resume, analytics, github, agent
│        ├─ lib/           # ← the AI core
│        │  ├─ agent/      # orchestrator (detect→plan→act→reflect→synthesize)
│        │  ├─ retriever/  # vector repo (pgvector), hybrid search, reranker
│        │  ├─ embeddings/ # chunker, extractor, ingestion pipeline
│        │  ├─ tools/      # 12 agent tools + registry
│        │  ├─ memory/     # conversation memory
│        │  ├─ prompts/    # system prompts (grounding rules)
│        │  └─ llm/        # Gemini client (generate + embed + stream)
│        └─ workers/       # BullMQ ingestion worker
├─ packages/shared/        # shared TS types + Zod contracts
├─ knowledge/              # your content (resume, projects, skills…) → ingested
├─ docker/                 # compose + Dockerfiles
└─ docs/                   # API reference
```

---

## 🚀 Quick start

### 1. Prerequisites
- Node 20+, pnpm 9+, Docker (for Postgres/Redis), a **Gemini API key**.

### 2. Configure
```bash
cp .env.example .env
# set GEMINI_API_KEY, ADMIN_PASSWORD, GITHUB_USERNAME/TOKEN, etc.
```

### 3. Start infra + install
```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
pnpm install
```

### 4. Database
```bash
pnpm db:generate                 # prisma client
pnpm --filter @ai-portfolio/api prisma migrate deploy   # tables + pgvector
pnpm db:seed                     # admin user, skills, projects, register knowledge docs
```

### 5. Run (dev)
```bash
pnpm dev                         # web :3000 + api :4000 (via turbo)
# in another terminal, run the ingestion worker:
pnpm --filter @ai-portfolio/api start:worker
```

### 6. Index your knowledge
Log into the admin at `http://localhost:3000/admin`, or:
```bash
# after logging in, POST /embeddings/index embeds the seeded knowledge/ docs
curl -XPOST http://localhost:4000/api/v1/embeddings/index -H "Authorization: Bearer <token>" -d '{}'
```

Open **http://localhost:3000** and ask it anything.

### Full Docker (everything containerized)
```bash
docker compose -f docker/docker-compose.yml up --build
```

---

## ✍️ Making it *yours*

Everything the agent knows comes from two places — edit both:

1. **`knowledge/`** — markdown/txt/json files (resume, projects, blogs…). These are chunked + embedded. The samples are marked `> SAMPLE`; replace them.
2. **`apps/api/prisma/seed.ts`** — structured records (projects, skills, experience) used by deterministic tools.
3. Drop your **resume PDF** at `knowledge/resume/ashish-pokhrel-resume.pdf` for the `GET /resume` download.
4. Set `GITHUB_USERNAME`/`GITHUB_TOKEN` and hit **Sync GitHub** to pull repos + READMEs into the vector store.

The agent will **never** state anything not present in this content — accuracy is on you, hallucination is off the table.

---

## 🧪 Testing & quality

```bash
pnpm test          # unit tests (chunker, reranker, …)
pnpm lint          # eslint across the monorepo
pnpm build         # type-check + build both apps
```
CI (`.github/workflows/ci.yml`) spins up Postgres+Redis and runs lint/build/test on every push.

---

## 🔒 Non-functional highlights

Clean Architecture & SOLID (domain logic in `lib/`, infra behind interfaces) · repository pattern over Prisma · DI throughout · strict TypeScript · Zod validation · global exception filter · structured logging (pino) · rate limiting (Throttler) · Redis caching-ready · streaming responses · Docker + compose · CI/CD.

---

## 📌 Scaffold note

This is a **production-shaped scaffold**: the architecture, data model, RAG/agent pipeline, streaming chat, ingestion, and Docker/CI are all wired together and coherent. Before deploying you'll want to: add your real content, provide a valid `GEMINI_API_KEY`, run `pnpm install` to generate the lockfile, and review the sample auth (swap the SHA-256 password hashing in `auth.service.ts` for `argon2`/`bcrypt`).
