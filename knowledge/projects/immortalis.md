# Immortalis

> SAMPLE PROJECT — replace with your real project details.

## Summary
Immortalis is a digital-legacy platform that lets people preserve memories,
documents, and messages to be delivered to loved ones over time. It combines a
secure vault, scheduled delivery, and an AI assistant that can answer questions
about a person's archived content.

## Architecture
- **Frontend**: Next.js + TypeScript, Tailwind, streaming UI.
- **Backend**: NestJS modular monolith, PostgreSQL, Redis, BullMQ for scheduled
  and delayed message delivery.
- **AI layer**: RAG over the user's uploaded documents using pgvector embeddings.
- **Storage**: encrypted object storage on AWS S3; KMS-managed keys.

## Key features
- Encrypted memory vault with per-recipient access control.
- Time-based and event-based message delivery via a durable job queue.
- AI assistant that answers questions grounded in the archived content.
- Audit log and legacy-executor workflow.

## Technologies
NestJS, PostgreSQL, pgvector, Redis, BullMQ, Next.js, TypeScript, AWS (S3, KMS),
Docker.

## Challenges
Designing delivery guarantees for messages scheduled years into the future,
and encrypting content while still enabling semantic search over it.

## Lessons learned
Durable scheduling is a systems problem, not a cron problem — idempotent jobs
and a source-of-truth state machine matter more than the trigger mechanism.
