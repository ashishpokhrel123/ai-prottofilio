import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../persistence/prisma.service";
import { AppConfigService } from "../../common/config/app-config.service";
import {
  DependencyUnavailableError,
  InvalidInputError,
  errorMessage,
} from "../../core/errors/domain.errors";
import type {
  RetrievedChunk,
  SearchFilter,
  VectorStorePort,
} from "../../core/ports";

/**
 * Allow-lists for enum-typed filter columns.
 *
 * Postgres cannot parameterise an identifier or an enum cast the way it
 * parameterises a value inside `ANY(...)`, and these values originate from
 * agent tools. Validating against the schema enums up front means a malformed
 * or hostile filter is rejected before it can reach the query builder.
 */
const DOC_TYPES = new Set([
  "RESUME",
  "PROJECT",
  "CERTIFICATE",
  "BLOG",
  "EXPERIENCE",
  "EDUCATION",
  "SKILL",
  "README",
  "OTHER",
]);

const SOURCE_TYPES = new Set([
  "GITHUB",
  "WEBSITE",
  "LINKEDIN",
  "MANUAL_UPLOAD",
]);

/** Raw shape returned by the similarity/hybrid queries. */
interface ChunkRow {
  id: string;
  documentId: string;
  content: string;
  title: string;
  source: string;
  docType: string;
  tags: string[] | null;
  score: number | string | null;
  similarity: number | string | null;
}

/**
 * pgvector-backed implementation of `VectorStorePort`.
 *
 * All raw SQL in the application lives in this one file. Every value is bound
 * as a parameter through `Prisma.sql` — the previous implementation
 * interpolated the user's query text straight into `$queryRawUnsafe`, which
 * was a SQL-injection vector reachable from any chat message.
 */
@Injectable()
export class PgVectorStore implements VectorStorePort {
  private readonly logger = new Logger(PgVectorStore.name);
  private readonly dimensions: number;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfigService,
  ) {
    this.dimensions = config.gemini.dimensions;
  }

  async similaritySearch(
    embedding: readonly number[],
    topK: number,
    filter?: SearchFilter,
  ): Promise<RetrievedChunk[]> {
    const vec = this.toVectorLiteral(embedding);
    const limit = this.toLimit(topK);
    const where = this.filterConditions(filter);

    const rows = await this.query<ChunkRow>(
      Prisma.sql`
        SELECT c."id",
               c."documentId",
               c."content",
               d."title",
               d."source"::text  AS "source",
               d."docType"::text AS "docType",
               d."tags",
               1 - (c."embedding" <=> ${vec}::vector) AS "score",
               -- Pure vector search ranks by similarity, so the two are the
               -- same here. Both are returned so callers never have to know
               -- which strategy produced the row.
               1 - (c."embedding" <=> ${vec}::vector) AS "similarity"
        FROM "Chunk" c
        JOIN "Document" d ON d."id" = c."documentId"
        WHERE c."embedding" IS NOT NULL
          ${where}
        ORDER BY c."embedding" <=> ${vec}::vector
        LIMIT ${limit}
      `,
    );

    return rows.map(toChunk);
  }

  /**
   * Dense retrieval fused with lexical retrieval via Reciprocal Rank Fusion.
   *
   * RRF is rank-based rather than score-based, so it needs no calibration
   * between the two very differently-scaled signals. k=60 is the constant from
   * the original Cormack et al. paper and works well without tuning.
   */
  async hybridSearch(
    embedding: readonly number[],
    query: string,
    topK: number,
    filter?: SearchFilter,
  ): Promise<RetrievedChunk[]> {
    const vec = this.toVectorLiteral(embedding);
    const limit = this.toLimit(topK);
    const candidateLimit = limit * 3;
    const where = this.filterConditions(filter);
    const text = query.trim().slice(0, 1_000);

    const rows = await this.query<ChunkRow>(
      Prisma.sql`
        WITH vector_hits AS (
          SELECT c."id",
                 ROW_NUMBER() OVER (ORDER BY c."embedding" <=> ${vec}::vector) AS rnk
          FROM "Chunk" c
          JOIN "Document" d ON d."id" = c."documentId"
          WHERE c."embedding" IS NOT NULL
            ${where}
          ORDER BY c."embedding" <=> ${vec}::vector
          LIMIT ${candidateLimit}
        ),
        keyword_hits AS (
          SELECT c."id",
                 ROW_NUMBER() OVER (
                   ORDER BY ts_rank(c."contentTsv", plainto_tsquery('english', ${text})) DESC
                 ) AS rnk
          FROM "Chunk" c
          JOIN "Document" d ON d."id" = c."documentId"
          WHERE c."contentTsv" @@ plainto_tsquery('english', ${text})
            ${where}
          -- Postgres evaluates window functions before ORDER BY/LIMIT, so a
          -- bare LIMIT here truncated an *unordered* result: the ranks were
          -- right but the surviving rows were arbitrary, and the lexical half
          -- of the fusion could return candidates ranked 400th while the true
          -- top match was discarded. Ordering by the rank makes the cut
          -- deterministic and actually top-k.
          ORDER BY rnk
          LIMIT ${candidateLimit}
        ),
        fused AS (
          SELECT id, SUM(1.0 / (60 + rnk)) AS rrf
          FROM (
            SELECT id, rnk FROM vector_hits
            UNION ALL
            SELECT id, rnk FROM keyword_hits
          ) u
          GROUP BY id
        )
        SELECT c."id",
               c."documentId",
               c."content",
               d."title",
               d."source"::text  AS "source",
               d."docType"::text AS "docType",
               d."tags",
               f.rrf AS "score",
               -- Recomputed per returned row so callers get a real 0..1
               -- similarity alongside the fusion score. Only runs for the
               -- final LIMIT rows, so the cost is negligible. Keyword-only
               -- matches have no embedding, hence the coalesce.
               COALESCE(1 - (c."embedding" <=> ${vec}::vector), 0) AS "similarity"
        FROM fused f
        JOIN "Chunk" c    ON c."id" = f.id
        JOIN "Document" d ON d."id" = c."documentId"
        ORDER BY f.rrf DESC
        LIMIT ${limit}
      `,
    );

    return rows.map(toChunk);
  }

  async saveEmbedding(
    chunkId: string,
    embedding: readonly number[],
  ): Promise<void> {
    const vec = this.toVectorLiteral(embedding);
    await this.execute(
      Prisma.sql`UPDATE "Chunk" SET "embedding" = ${vec}::vector WHERE "id" = ${chunkId}`,
    );
  }

  /**
   * Writes a batch in one statement via `unnest`, instead of N round trips.
   * At 32 chunks per batch this is the difference between one query and 32.
   */
  async saveEmbeddings(
    entries: readonly { chunkId: string; embedding: readonly number[] }[],
  ): Promise<void> {
    if (entries.length === 0) return;

    const ids = entries.map((e) => e.chunkId);
    const vectors = entries.map((e) => this.toVectorLiteral(e.embedding));

    await this.execute(
      Prisma.sql`
        UPDATE "Chunk" AS c
        SET "embedding" = v.embedding::vector
        FROM (
          SELECT * FROM unnest(${ids}::text[], ${vectors}::text[]) AS t(id, embedding)
        ) AS v
        WHERE c."id" = v.id
      `,
    );
  }

  // --------------------------------------------------------------- internals

  /**
   * Builds the metadata filter as composable, parameterised SQL fragments.
   * Enum values are allow-listed; tags are bound as a text array parameter.
   */
  private filterConditions(filter?: SearchFilter): Prisma.Sql {
    if (!filter) return Prisma.empty;

    const conditions: Prisma.Sql[] = [];

    const docTypes = this.validateEnum(filter.docTypes, DOC_TYPES, "docType");
    if (docTypes.length > 0) {
      conditions.push(Prisma.sql`d."docType"::text = ANY(${docTypes}::text[])`);
    }

    const sources = this.validateEnum(filter.sources, SOURCE_TYPES, "source");
    if (sources.length > 0) {
      conditions.push(Prisma.sql`d."source"::text = ANY(${sources}::text[])`);
    }

    const tags = (filter.tags ?? []).filter((t) => t.length > 0).slice(0, 32);
    if (tags.length > 0) {
      conditions.push(Prisma.sql`d."tags" && ${tags}::text[]`);
    }

    if (conditions.length === 0) return Prisma.empty;
    return Prisma.sql` AND ${Prisma.join(conditions, " AND ")}`;
  }

  private validateEnum(
    values: readonly string[] | undefined,
    allowed: ReadonlySet<string>,
    label: string,
  ): string[] {
    if (!values?.length) return [];
    const invalid = values.filter((v) => !allowed.has(v));
    if (invalid.length > 0) {
      throw new InvalidInputError(
        `Unknown ${label} filter value(s): ${invalid.join(", ")}`,
        { allowed: [...allowed] },
      );
    }
    return [...values];
  }

  /** Guards against a caller passing a wrongly-sized or non-finite vector. */
  private toVectorLiteral(v: readonly number[]): string {
    if (v.length !== this.dimensions) {
      throw new InvalidInputError(
        `Embedding has ${v.length} dimensions but the store expects ${this.dimensions}. ` +
          "Check EMBEDDING_DIMENSIONS against the vector(n) column.",
      );
    }
    if (!v.every(Number.isFinite)) {
      throw new InvalidInputError("Embedding contains non-finite values.");
    }
    return `[${v.join(",")}]`;
  }

  private toLimit(topK: number): number {
    if (!Number.isInteger(topK) || topK < 1 || topK > 200) {
      throw new InvalidInputError(
        `topK must be an integer in 1..200, got ${topK}`,
      );
    }
    return topK;
  }

  private async query<T>(sql: Prisma.Sql): Promise<T[]> {
    try {
      return await this.prisma.$queryRaw<T[]>(sql);
    } catch (err) {
      throw this.wrap(err);
    }
  }

  private async execute(sql: Prisma.Sql): Promise<void> {
    try {
      await this.prisma.$executeRaw(sql);
    } catch (err) {
      throw this.wrap(err);
    }
  }

  private wrap(err: unknown): Error {
    if (err instanceof InvalidInputError) return err;
    const message = `Vector store query failed: ${errorMessage(err)}`;
    this.logger.error(message);
    return new DependencyUnavailableError("pgvector", message, { cause: err });
  }
}

function toChunk(row: ChunkRow): RetrievedChunk {
  return {
    id: row.id,
    documentId: row.documentId,
    content: row.content,
    title: row.title,
    source: row.source,
    docType: row.docType,
    tags: row.tags ?? [],
    score: Number(row.score ?? 0),
    // Clamped: floating-point error in the distance operator can nudge this
    // a hair outside 0..1, and a threshold comparison should not care.
    similarity: Math.min(1, Math.max(0, Number(row.similarity ?? 0))),
  };
}
