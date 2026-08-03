/* eslint-disable no-console -- a CLI task whose entire output is its progress report. */

/**
 * Re-embeds existing chunks in place, without touching their source files.
 *
 *   pnpm --filter @ai-portfolio/api db:reembed
 *
 * WHY THIS EXISTS
 *
 * The admin "Re-index" button rebuilds a document from its original upload:
 * read the file from storage → extract text → re-chunk → embed. That is the
 * right behaviour when the *content* changed.
 *
 * Switching embedding provider is a different problem. The content did not
 * change — only the vector space did. Re-index still insists on the source
 * file, and on any machine where the database was restored but `uploads/` was
 * not (a fresh clone, a new laptop, a redeployed container with an empty
 * volume) every job fails on `storage.read()`. Combined with the vector-width
 * migration, which drops the old embeddings first, that turns a provider
 * switch into permanent loss of the knowledge base.
 *
 * The chunk text is already in Postgres. This reads it from there, embeds it
 * with whichever provider `LLM_PROVIDER` currently selects, and writes the
 * vectors back. No filesystem, no re-chunking, no extraction.
 *
 * Safe to re-run: by default it only touches chunks whose embedding is NULL,
 * so an interrupted run resumes where it stopped.
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/infrastructure/persistence/prisma.service";
import {
  EMBEDDING_PORT,
  VECTOR_STORE_PORT,
  type EmbeddingPort,
  type VectorStorePort,
} from "../src/core/ports";

/**
 * Chunks per provider call.
 *
 * Matches the ingestion service. Small enough to stay inside a free-tier rate
 * limit, large enough that a few hundred chunks do not become a few hundred
 * round trips.
 */
const BATCH = 32;

/** Re-embed everything, not just the chunks currently missing a vector. */
const ALL = process.argv.includes("--all");

async function main(): Promise<void> {
  // The Nest context rather than hand-built adapters, so this uses exactly the
  // provider the running API would use. Duplicating the LLM_PROVIDER switch
  // here is how a script quietly writes vectors from the wrong model.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["warn", "error"],
  });

  try {
    const prisma = app.get(PrismaService);
    const embeddings = app.get<EmbeddingPort>(EMBEDDING_PORT);
    const vectors = app.get<VectorStorePort>(VECTOR_STORE_PORT);

    const pending = await prisma.$queryRawUnsafe<
      { id: string; content: string }[]
    >(
      `SELECT "id", "content" FROM "Chunk"
       ${ALL ? "" : `WHERE "embedding" IS NULL`}
       ORDER BY "documentId", "chunkIndex"`,
    );

    if (pending.length === 0) {
      console.log(
        "\nNothing to do — every chunk already has an embedding.\n" +
          "Pass --all to re-embed regardless.\n",
      );
      return;
    }

    console.log(
      `\nRe-embedding ${pending.length} chunk(s) at ${embeddings.dimensions} dimensions.\n`,
    );

    let done = 0;
    let failed = 0;

    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);

      try {
        const vecs = await embeddings.embedDocuments(
          batch.map((c) => c.content),
        );

        await vectors.saveEmbeddings(
          batch.map((chunk, j) => ({ chunkId: chunk.id, embedding: vecs[j] })),
        );

        done += batch.length;
      } catch (err) {
        // One bad batch must not abandon the rest. Because the query selects
        // only NULL embeddings, re-running picks up whatever failed here.
        failed += batch.length;
        console.error(
          `  batch at ${i} failed: ${
            err instanceof Error ? err.message.split("\n")[0] : String(err)
          }`,
        );
      }

      process.stdout.write(
        `\r  ${done}/${pending.length} embedded${failed ? ` · ${failed} failed` : ""}   `,
      );
    }

    console.log("\n");

    // Only now does the status column become true. Marking documents INDEXED
    // before their vectors exist is what makes an empty knowledge base look
    // healthy in the admin panel.
    const stillMissing = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM "Chunk" WHERE "embedding" IS NULL`;

    if (Number(stillMissing[0].count) === 0) {
      const { count } = await prisma.document.updateMany({
        where: { status: { in: ["PENDING", "FAILED"] } },
        data: { status: "INDEXED" },
      });
      console.log(`Marked ${count} document(s) INDEXED.`);
    } else {
      console.log(
        `${stillMissing[0].count} chunk(s) still without an embedding — ` +
          "documents left as-is. Re-run to retry just those.",
      );
    }

    console.log(
      failed === 0
        ? "\nDone. Retrieval is live again.\n"
        : `\nDone with ${failed} failure(s). Re-run to retry them.\n`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
