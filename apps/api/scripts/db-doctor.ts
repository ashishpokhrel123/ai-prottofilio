/* eslint-disable no-console -- a CLI diagnostic whose entire output is its report. */

/**
 * Answers "why is the admin panel empty?" in one command.
 *
 *   pnpm --filter @ai-portfolio/api db:doctor
 *
 * Exists because four distinct failures all surface identically — a 503 and
 * "couldn't load documents" in the UI:
 *
 *   · migrations never applied      → the table does not exist
 *   · seed never run                → the table exists and is empty
 *   · worker never run              → rows exist, all stuck at PENDING
 *   · embedding width mismatch      → rows exist, no vectors, inserts fail
 *
 * Connects through DIRECT_URL, not DATABASE_URL. The pooler is the thing most
 * likely to be broken when someone runs this, and a diagnostic that fails for
 * the same reason as the bug is useless.
 */

import { PrismaClient } from "@prisma/client";
import { loadEnvFiles } from "../src/common/config/load-env";

loadEnvFiles();

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string, fix: string) => {
  console.log(`  FAIL  ${m}`);
  console.log(`        → ${fix}`);
};

async function main(): Promise<void> {
  if (!url) {
    console.error("Neither DIRECT_URL nor DATABASE_URL is set.");
    process.exit(1);
  }

  console.log(`\ndatabase doctor → ${new URL(url).host}\n`);

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    await prisma.$queryRaw`SELECT 1`;
    ok("reachable");
  } catch (err) {
    bad(
      `unreachable: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
      "check DIRECT_URL, and that the Neon project is not suspended",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  // Migrations. Everything below is meaningless if the schema was never applied.
  const applied = await prisma
    .$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
    .catch(() => null);

  if (applied === null) {
    bad(
      "no _prisma_migrations table — migrations have never run here",
      "pnpm db:migrate",
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  ok(`migrations applied: ${applied[0].count}`);

  // The vector column: type and width, read from the catalogue rather than
  // assumed from EMBEDDING_DIMENSIONS.
  const column = await prisma
    .$queryRaw<{ type: string }[]>`
      SELECT format_type(a.atttypid, a.atttypmod) AS type
      FROM pg_attribute a
      WHERE a.attrelid = '"Chunk"'::regclass AND a.attname = 'embedding'`
    .catch(() => null);

  const configured = process.env.EMBEDDING_DIMENSIONS ?? "768";

  if (!column?.length) {
    bad("Chunk.embedding column is missing", "pnpm db:migrate");
  } else {
    const actual = column[0].type;
    const matches = actual.includes(`(${configured})`);
    if (matches) {
      ok(`Chunk.embedding is ${actual}, matches EMBEDDING_DIMENSIONS=${configured}`);
    } else {
      bad(
        `Chunk.embedding is ${actual} but EMBEDDING_DIMENSIONS=${configured}`,
        "psql \"$DIRECT_URL\" -f apps/api/prisma/manual/switch-embedding-dimensions.sql",
      );
    }
  }

  // Content.
  const [docs, chunks, embedded] = await Promise.all([
    prisma.document.count(),
    prisma.chunk.count(),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM "Chunk" WHERE "embedding" IS NOT NULL`,
  ]);

  const vectors = Number(embedded[0].count);

  if (docs === 0) {
    bad("no documents — the knowledge base was never seeded", "pnpm db:seed");
  } else {
    ok(`documents: ${docs}`);

    const byStatus = await prisma.document.groupBy({
      by: ["status"],
      _count: true,
    });
    for (const row of byStatus) {
      console.log(`          ${row.status.padEnd(10)} ${row._count}`);
    }

    const pending = byStatus.find((r) => r.status === "PENDING")?._count ?? 0;
    if (pending > 0 && chunks === 0) {
      bad(
        `${pending} document(s) queued but never processed`,
        "run `pnpm worker` in a second terminal, then Re-index from /admin",
      );
    }
  }

  if (chunks > 0 && vectors === 0) {
    bad(
      `${chunks} chunks exist but none have embeddings`,
      "Re-index from /admin — and check the worker log for embedding errors",
    );
  } else if (chunks > 0) {
    ok(`chunks: ${chunks}, embedded: ${vectors}`);
  }

  console.log(
    docs > 0 && vectors > 0
      ? "\nRetrieval has data to work with.\n"
      : "\nRetrieval will return nothing until the failures above are fixed.\n",
  );

  await prisma.$disconnect();
}

void main().catch(async (err: unknown) => {
  console.error(err);
  process.exit(1);
});
