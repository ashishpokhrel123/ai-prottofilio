import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/config/prisma.service";

export interface RetrievedChunk {
  id: string;
  documentId: string;
  content: string;
  title: string;
  source: string;
  docType: string;
  tags: string[];
  score: number; // similarity (1 - cosine distance) or hybrid score
}

export interface SearchFilter {
  docTypes?: string[];
  sources?: string[];
  tags?: string[];
}

/**
 * Repository over pgvector. All raw SQL is isolated here (Repository pattern),
 * so services never write SQL and can be unit-tested against this interface.
 */
@Injectable()
export class VectorRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toVectorLiteral(v: number[]): string {
    return `[${v.join(",")}]`;
  }

  private filterClause(f?: SearchFilter): string {
    if (!f) return "";
    const parts: string[] = [];
    if (f.docTypes?.length)
      parts.push(`d."docType"::text = ANY(ARRAY['${f.docTypes.join("','")}'])`);
    if (f.sources?.length)
      parts.push(`d."source"::text = ANY(ARRAY['${f.sources.join("','")}'])`);
    if (f.tags?.length)
      parts.push(`d."tags" && ARRAY['${f.tags.join("','")}']`);
    return parts.length ? `AND ${parts.join(" AND ")}` : "";
  }

  /** Pure vector similarity search (cosine). */
  async similaritySearch(
    embedding: number[],
    topK: number,
    filter?: SearchFilter,
  ): Promise<RetrievedChunk[]> {
    const vec = this.toVectorLiteral(embedding);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT c."id", c."documentId", c."content", d."title", d."source"::text AS source,
             d."docType"::text AS "docType", d."tags",
             1 - (c."embedding" <=> '${vec}'::vector) AS score
      FROM "Chunk" c
      JOIN "Document" d ON d."id" = c."documentId"
      WHERE c."embedding" IS NOT NULL ${this.filterClause(filter)}
      ORDER BY c."embedding" <=> '${vec}'::vector
      LIMIT ${topK};
    `);
    return rows.map(this.map);
  }

  /**
   * Hybrid search: combine cosine similarity with full-text rank via
   * Reciprocal Rank Fusion. Returns a merged, de-duplicated set.
   */
  async hybridSearch(
    embedding: number[],
    query: string,
    topK: number,
    filter?: SearchFilter,
  ): Promise<RetrievedChunk[]> {
    const vec = this.toVectorLiteral(embedding);
    const q = query.replace(/'/g, "''");
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      WITH vector_hits AS (
        SELECT c."id", ROW_NUMBER() OVER (ORDER BY c."embedding" <=> '${vec}'::vector) AS rnk,
               1 - (c."embedding" <=> '${vec}'::vector) AS sim
        FROM "Chunk" c JOIN "Document" d ON d."id" = c."documentId"
        WHERE c."embedding" IS NOT NULL ${this.filterClause(filter)}
        ORDER BY c."embedding" <=> '${vec}'::vector LIMIT ${topK * 3}
      ),
      keyword_hits AS (
        SELECT c."id", ROW_NUMBER() OVER (
                 ORDER BY ts_rank(c."contentTsv", plainto_tsquery('english', '${q}')) DESC) AS rnk
        FROM "Chunk" c JOIN "Document" d ON d."id" = c."documentId"
        WHERE c."contentTsv" @@ plainto_tsquery('english', '${q}') ${this.filterClause(filter)}
        LIMIT ${topK * 3}
      ),
      fused AS (
        SELECT id, SUM(1.0 / (60 + rnk)) AS rrf FROM (
          SELECT id, rnk FROM vector_hits
          UNION ALL
          SELECT id, rnk FROM keyword_hits
        ) u GROUP BY id
      )
      SELECT c."id", c."documentId", c."content", d."title", d."source"::text AS source,
             d."docType"::text AS "docType", d."tags", f.rrf AS score
      FROM fused f
      JOIN "Chunk" c ON c."id" = f.id
      JOIN "Document" d ON d."id" = c."documentId"
      ORDER BY f.rrf DESC
      LIMIT ${topK};
    `);
    return rows.map(this.map);
  }

  /** Persist an embedding for a chunk (called by the ingestion worker). */
  async saveEmbedding(chunkId: string, embedding: number[]): Promise<void> {
    const vec = this.toVectorLiteral(embedding);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "Chunk" SET "embedding" = '${vec}'::vector WHERE "id" = $1;`,
      chunkId,
    );
  }

  private map = (r: any): RetrievedChunk => ({
    id: r.id,
    documentId: r.documentId,
    content: r.content,
    title: r.title,
    source: r.source,
    docType: r.docType,
    tags: r.tags ?? [],
    score: Number(r.score),
  });
}
