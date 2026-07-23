import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Citation } from "@ai-portfolio/shared";
import { EmbeddingsService } from "../embeddings/embeddings.service";
import {
  VectorRepository,
  RetrievedChunk,
  SearchFilter,
} from "./vector.repository";
import { Reranker } from "./reranker";

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  citations: Citation[];
  context: string;
  confident: boolean;
}

/**
 * Orchestrates the retrieval half of RAG:
 * embed → hybrid search → rerank → context-compress → citations.
 */
@Injectable()
export class RetrieverService {
  constructor(
    private readonly config: ConfigService,
    private readonly embeddings: EmbeddingsService,
    private readonly vectors: VectorRepository,
    private readonly reranker: Reranker,
  ) {}

  async retrieve(
    query: string,
    filter?: SearchFilter,
  ): Promise<RetrievalResult> {
    const topK = this.config.get<number>("rag.topK") ?? 8;
    const topN = this.config.get<number>("rag.rerankTopN") ?? 4;
    const minSim = this.config.get<number>("rag.minSimilarity") ?? 0.35;

    const embedding = await this.embeddings.embedQuery(query);
    const hits = await this.vectors.hybridSearch(
      embedding,
      query,
      topK,
      filter,
    );

    if (hits.length === 0) {
      return { chunks: [], citations: [], context: "", confident: false };
    }

    const ranked = this.reranker.rerank(query, hits, topN);
    const compressed = this.compress(query, ranked);
    const confident = ranked.some((c) => c.score >= minSim);

    const citations: Citation[] = ranked.map((c, i) => ({
      index: i + 1,
      chunkId: c.id,
      documentId: c.documentId,
      title: c.title,
      source: c.source,
      snippet: c.content.slice(0, 220),
      score: Number(c.score.toFixed(4)),
    }));

    const context = compressed
      .map(
        (c, i) =>
          `[${i + 1}] (${c.docType} · ${c.source}) ${c.title}\n${c.content}`,
      )
      .join("\n\n---\n\n");

    return { chunks: ranked, citations, context, confident };
  }

  /**
   * Context compression — trims each chunk to the sentences most relevant
   * to the query, keeping the prompt tight and reducing hallucination surface.
   */
  private compress(query: string, chunks: RetrievedChunk[]): RetrievedChunk[] {
    const terms = new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
    return chunks.map((c) => {
      const sentences = c.content.split(/(?<=[.!?])\s+/);
      if (sentences.length <= 4) return c;
      const scored = sentences.map((s) => {
        const words = s.toLowerCase().split(/\s+/);
        const hits = words.filter((w) => terms.has(w)).length;
        return { s, hits };
      });
      const kept = scored
        .map((x, i) => ({ ...x, i }))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 5)
        .sort((a, b) => a.i - b.i)
        .map((x) => x.s);
      return { ...c, content: kept.join(" ") };
    });
  }
}
