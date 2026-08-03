-- ============================================================================
-- Re-widths Chunk.embedding when the embedding provider changes.
--
--   Gemini text-embedding-004      →  vector(768)   [the 0001 migration]
--   nvidia/nemotron-3-embed-1b     →  vector(2048)  [this script]
--
-- DELIBERATELY NOT A PRISMA MIGRATION.
--
-- `prisma migrate deploy` applies everything in migrations/ on every deploy.
-- A provider switch is destructive and one-directional — putting it there
-- would mean any existing Gemini deploy silently lost its entire vector index
-- on its next release. This is an operator action, run once, on purpose.
--
-- RUN IT AGAINST $DIRECT_URL, NOT $DATABASE_URL:
--
--   psql "$DIRECT_URL" -f apps/api/prisma/manual/switch-embedding-dimensions.sql
--
-- This database is Neon, and `DATABASE_URL` is its *pooled* endpoint (the
-- `-pooler` host). PgBouncer in transaction mode hands each statement whatever
-- backend is free, so a multi-statement DDL transaction is not guaranteed to
-- stay on one session — the ALTER and the UPDATE below can land on different
-- connections and the BEGIN/COMMIT stops meaning what it says. `DIRECT_URL` is
-- already set in .env for exactly this reason; Prisma uses it for migrations.
--
-- Set EMBEDDING_DIMENSIONS=2048 and LLM_PROVIDER=nvidia in the same change.
-- The env schema refuses to boot if they disagree, which is the safety net —
-- but it fires at startup, so running this against a live API leaves a window
-- where the app is up and the column is wrong. Stop the API first.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Why the vectors are dropped rather than converted
--
-- An embedding is only meaningful inside the space the model that produced it
-- defines. There is no padding, projection or rescaling that turns a Gemini
-- vector into a Nemotron one. Keeping the old rows would leave the table
-- looking fully populated while every similarity score was noise — the worst
-- available failure mode, because nothing errors.
--
-- The chunk TEXT is untouched, so this costs a re-embed, not a re-upload.
-- ---------------------------------------------------------------------------

BEGIN;

-- The ivfflat index is dropped and NOT recreated.
--
-- pgvector caps ivfflat and hnsw at 2000 dimensions; 2048 exceeds it and
-- CREATE INDEX fails outright rather than degrading. Cosine search therefore
-- runs as a sequential scan, which is the right trade at this scale — a
-- portfolio knowledge base is thousands of chunks, not millions, and a scan
-- over that is well under the model round-trip that follows it.
--
-- If the corpus outgrows that, the fix is halfvec rather than a smaller model:
-- pgvector indexes halfvec up to 4000 dimensions, at half the storage and a
-- negligible recall cost.
--
--   ALTER TABLE "Chunk" ALTER COLUMN "embedding" TYPE halfvec(2048);
--   CREATE INDEX chunk_embedding_hnsw ON "Chunk"
--     USING hnsw ("embedding" halfvec_cosine_ops);
--
-- That also requires every `::vector` cast in pgvector.store.ts to become
-- `::halfvec`, which is why it is not done here.
DROP INDEX IF EXISTS chunk_embedding_ivfflat;

ALTER TABLE "Chunk" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "Chunk" ADD COLUMN "embedding" vector(2048);

-- Without this the re-index is a no-op.
--
-- `EmbeddingsIndexService.index()` with no documentId selects only PENDING and
-- FAILED documents, and everything already ingested is INDEXED — so the
-- endpoint would report "queued: 0" and the operator would reasonably conclude
-- the re-index had run. Marking them PENDING is what makes the status column
-- tell the truth: these documents have chunks but no vectors.
UPDATE "Document" SET "status" = 'PENDING' WHERE "status" = 'INDEXED';

COMMIT;

-- Confirmation, so the operator does not have to take this on faith. Expect
-- `vector(2048)` and a count matching the documents queued for re-indexing.
SELECT
  format_type(a.atttypid, a.atttypmod) AS embedding_column,
  (SELECT count(*) FROM "Document" WHERE "status" = 'PENDING') AS docs_to_reindex,
  (SELECT count(*) FROM "Chunk") AS chunks_awaiting_vectors
FROM pg_attribute a
WHERE a.attrelid = '"Chunk"'::regclass
  AND a.attname = 'embedding';

-- ---------------------------------------------------------------------------
-- THEN RE-EMBED. This script leaves the site running with zero retrieval.
--
--   pnpm --filter @ai-portfolio/api db:reembed
--
-- USE THAT, NOT THE ADMIN "RE-INDEX" BUTTON.
--
-- Re-index rebuilds each document from its original upload: read the file from
-- storage → extract → re-chunk → embed. That is correct when the content
-- changed, and wrong here — the content did not change, only the vector space
-- did. Worse, it makes recovery depend on `UPLOAD_DIR` still holding every
-- source file. On any machine where the database came across but the uploads
-- directory did not (a fresh clone, a new laptop, a container with an empty
-- volume) every job fails on a missing file, and since this script has already
-- dropped the old vectors, the knowledge base is gone with no way back.
--
-- `db:reembed` reads the chunk text straight from Postgres, embeds it with
-- whichever provider LLM_PROVIDER selects, and writes the vectors back. No
-- filesystem involved. Check first with:
--
--   pnpm --filter @ai-portfolio/api db:doctor
--
-- Until it finishes, the agent answers from its tools alone and cites nothing.
-- That is the intended degraded state, not a bug: `embedding IS NOT NULL`
-- guards every search path in pgvector.store.ts, so stale vectors are never
-- served — they are simply absent.
--
-- TO REVERT: run this file with 2048 replaced by 768, restore the ivfflat
-- index, set EMBEDDING_DIMENSIONS=768 and LLM_PROVIDER=gemini, and re-index.
--
--   CREATE INDEX chunk_embedding_ivfflat ON "Chunk"
--     USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
-- ---------------------------------------------------------------------------
