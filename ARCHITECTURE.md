# System Architecture — Agentic RAG AI Portfolio

## 1. Overview

This is not a portfolio website with a chatbot bolted on. The **portfolio is the assistant**. A visitor lands on a hero + chat input and asks natural-language questions ("Are you a good fit for an AI Engineer role?"). An autonomous agent plans, chooses tools, retrieves grounded context from a vector store, and streams a cited answer.

The system is a **pnpm + Turborepo monorepo** with two deployables (`apps/web`, `apps/api`) and shared packages. It follows Clean Architecture, SOLID, DDD-lite boundaries, and the repository pattern.

```
┌──────────────┐     WebSocket / SSE stream      ┌────────────────────────┐
│  Next.js 15  │ ◄──────────────────────────────►│      NestJS API        │
│   (web)      │      REST (React Query)         │  CQRS · Swagger · JWT  │
└──────┬───────┘                                  └───────┬────────────────┘
       │                                                  │
       │ hero + ChatGPT-style UI                          │  Agent Orchestrator
       │ Zustand · Framer Motion                          │  ├─ Intent detection
       │                                                  │  ├─ Planner (LangGraph-style)
       │                                                  │  ├─ Tool executor
       │                                                  │  └─ Streaming synthesizer
       │                                                  │
       │                          ┌───────────────────────┼───────────────────────┐
       │                          ▼                       ▼                       ▼
       │                 ┌────────────────┐     ┌──────────────────┐    ┌──────────────┐
       │                 │ PostgreSQL 16  │     │  Redis / BullMQ  │    │ Gemini 2.5   │
       │                 │  + pgvector    │     │  queues + cache  │    │ LLM + embed  │
       │                 └────────────────┘     └──────────────────┘    └──────────────┘
```

## 2. Request lifecycle (chat)

```
User question
  → POST /chat (or ws:chat)            NestJS ChatGateway / ChatController
  → ChatService.handle()
  → AgentOrchestrator.run()
       1. IntentDetector      → classify(intent, needsRetrieval, entities)
       2. Planner             → ordered tool plan (may be multi-step)
       3. ToolExecutor        → runs tools, chains outputs
             - RetrieverTool → EmbeddingsService.embed(query)
                             → VectorRepository.similaritySearch (pgvector)
                             → HybridSearch (vector + keyword tsvector)
                             → Reranker (cross-encoder / LLM-lite)
                             → ContextCompressor
             - ResumeTool, ProjectSearchTool, GithubTool, JDAnalyzerTool, ...
       4. Synthesizer         → Gemini 2.5 Pro, grounded prompt + citations
       5. Stream tokens       → SSE/WebSocket → client
  → Persist Conversation + Messages + Analytics
```

## 3. Agentic workflow

The agent is a small graph of nodes (a custom LangGraph-style state machine — see `lib/agent`). State flows through nodes; each node can short-circuit or route.

```
        ┌─────────────┐
        │  detect     │  intent + entities + memory resolution ("it" → last project)
        └──────┬──────┘
               ▼
        ┌─────────────┐   no
        │  plan       │────────► ┌──────────┐
        └──────┬──────┘          │ answer   │ (small talk / meta)
      needs    │ yes             └──────────┘
   retrieval   ▼
        ┌─────────────┐
        │  act        │  execute tool plan (chain allowed)
        └──────┬──────┘
               ▼
        ┌─────────────┐   need more?
        │  reflect    │──────────┐ loop back to plan (max N iterations)
        └──────┬──────┘          │
               ▼ done            │
        ┌─────────────┐ ◄────────┘
        │ synthesize  │  grounded, cited, streamed
        └─────────────┘
```

### Example — "I'm hiring an AI Engineer. Are you a good fit?"
`detect` → intent=`job_fit` → `plan`: [JDAnalyzer, ResumeTool, SkillSearch, ProjectSearch] → `act` chains them → `reflect` computes a match score + missing skills → `synthesize` streams a structured, cited answer.

## 4. Anti-hallucination strategy

1. **Retrieval-grounded**: the synthesizer only receives compressed, retrieved chunks + tool outputs.
2. **Citations required**: every factual claim maps to a `chunkId`/source; the prompt enforces `[n]` markers.
3. **Confidence gate**: if top similarity < `RAG_MIN_SIMILARITY`, the agent answers "I don't have that in my knowledge base" instead of guessing.
4. **Structured tool outputs**: JD-fit, project lists, etc. come from deterministic DB queries, not the LLM.
5. **System prompt** forbids inventing projects/dates/employers not present in context.

## 5. Data model (high level)

`User`, `Project`, `Skill`, `Experience`, `Education`, `Certificate`, `Blog`, `Document`, `Chunk` (with `vector(768)`), `Conversation`, `Message`, `AnalyticsEvent`, `SyncJob`. See `apps/api/prisma/schema.prisma`.

## 6. Ingestion pipeline

```
Upload (PDF/DOCX/MD/TXT/JSON/CSV/Image)
  → detect type → extract text (pdf-parse / mammoth / OCR tesseract)
  → clean/normalize
  → semantic chunking (size + overlap, heading-aware)
  → Gemini embeddings (batched)
  → store Chunk + vector + metadata (docType, source, tags, date)
  → mark Document.status = INDEXED
```
Runs in a **BullMQ worker** so uploads return immediately and index in the background.

## 7. Non-functional

- **Clean Architecture**: modules expose application services; domain logic lives in `lib/`; infrastructure (Prisma, Redis, Gemini) behind interfaces/ports.
- **DI everywhere** (Nest providers); **repository pattern** over Prisma.
- **CQRS** for chat/ingestion commands vs. read queries.
- Strict TS, Zod validation, global exception filter, structured logging (pino), Throttler rate limiting, Redis caching, Swagger docs, Docker + compose, GitHub Actions CI.

## 8. Deployment

`docker/docker-compose.yml` brings up: `postgres (pgvector)`, `redis`, `api`, `web`, `worker`. Each app has a multi-stage Dockerfile. Health checks + graceful shutdown included. See `README.md`.
