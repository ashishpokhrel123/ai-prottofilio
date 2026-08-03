import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Citation } from "@ai-portfolio/shared";
import { AppConfigService } from "../../common/config/app-config.service";
import { errorMessage } from "../../core/errors/domain.errors";
import {
  EMBEDDING_PORT,
  RERANKER_PORT,
  VECTOR_STORE_PORT,
  type EmbeddingPort,
  type RerankerPort,
  type RetrievedChunk,
  type SearchFilter,
  type VectorStorePort,
} from "../../core/ports";

/**
 * What retrieval actually did, measured rather than estimated.
 *
 * Exists so the UI can render an honest pipeline trace. Every field is either a
 * real measurement or absent — there is no default that stands in for an
 * unknown, because a trace that quietly invents a latency is worse than no
 * trace at all.
 */
export interface RetrievalStats {
  readonly dimensions: number;
  readonly embedMs: number;
  /** Candidates the hybrid search returned, before re-ranking. */
  readonly candidates: number;
  readonly searchMs: number;
  /** Candidates surviving the re-rank. */
  readonly kept: number;
  readonly rerankMs: number;
  /** `lexical` or the cross-encoder model id, from the bound reranker. */
  readonly strategy: string;
  /** Best similarity in the candidate set. 0 when nothing was retrieved. */
  readonly topSimilarity: number;
  readonly threshold: number;
}

export interface RetrievalResult {
  readonly chunks: readonly RetrievedChunk[];
  readonly citations: readonly Citation[];
  /** Chunks rendered as a numbered block for the synthesis prompt. */
  readonly context: string;
  /** True when at least one chunk cleared the similarity floor. */
  readonly confident: boolean;
  /**
   * Absent when retrieval never ran — a blank query, or a throw that
   * `retrieveSafely` swallowed. The UI omits the stage rather than showing
   * zeroes, which would read as "searched and found nothing".
   */
  readonly stats?: RetrievalStats;
}

const EMPTY_RESULT: RetrievalResult = Object.freeze({
  chunks: [],
  citations: [],
  context: "",
  confident: false,
});

const SNIPPET_LENGTH = 220;
const MAX_SENTENCES_KEPT = 5;
const COMPRESSION_THRESHOLD = 4;

/**
 * The retrieval half of RAG:
 *   embed → hybrid search → re-rank → context-compress → cite.
 *
 * Depends only on ports, so it unit-tests against in-memory stubs and runs
 * unchanged on any vector store or embedding provider.
 */
@Injectable()
export class RetrieverService {
  private readonly logger = new Logger(RetrieverService.name);

  constructor(
    private readonly config: AppConfigService,
    @Inject(RERANKER_PORT) private readonly reranker: RerankerPort,
    @Inject(EMBEDDING_PORT) private readonly embeddings: EmbeddingPort,
    @Inject(VECTOR_STORE_PORT) private readonly vectors: VectorStorePort,
  ) {}

  async retrieve(
    query: string,
    filter?: SearchFilter,
  ): Promise<RetrievalResult> {
    const trimmed = query.trim();
    if (!trimmed) return EMPTY_RESULT;

    const { topK, rerankTopN, minSimilarity } = this.config.rag;

    // Timed with a monotonic clock, not Date.now(): these numbers are rendered
    // to the visitor, and a wall-clock adjustment mid-request would otherwise
    // be able to produce a negative latency.
    const embedStart = performance.now();
    const embedding = await this.embeddings.embedQuery(trimmed);
    const embedMs = performance.now() - embedStart;

    const searchStart = performance.now();
    const hits = await this.vectors.hybridSearch(
      embedding,
      trimmed,
      topK,
      filter,
    );
    const searchMs = performance.now() - searchStart;

    if (hits.length === 0) {
      this.logger.debug(`No vector hits for query: "${truncate(trimmed, 80)}"`);
      return {
        ...EMPTY_RESULT,
        // A search that ran and matched nothing is a different fact from a
        // search that never ran, and the trace should be able to say so.
        stats: {
          dimensions: embedding.length,
          embedMs: round(embedMs),
          candidates: 0,
          searchMs: round(searchMs),
          kept: 0,
          rerankMs: 0,
          strategy: this.reranker.strategy,
          topSimilarity: 0,
          threshold: minSimilarity,
        },
      };
    }

    const rerankStart = performance.now();
    const ranked = await this.reranker.rerank(trimmed, hits, rerankTopN);
    const rerankMs = performance.now() - rerankStart;

    const compressed = this.compress(trimmed, ranked);

    return {
      chunks: ranked,
      citations: ranked.map((chunk, i) => toCitation(chunk, i + 1)),
      context: renderContext(compressed),
      // Gated on `similarity`, never `score`. `score` is a ranking value whose
      // scale depends on the search strategy — RRF produces ~0.02, so
      // comparing it here rejected every result regardless of relevance.
      confident: ranked.some((c) => c.similarity >= minSimilarity),
      stats: {
        dimensions: embedding.length,
        embedMs: round(embedMs),
        candidates: hits.length,
        searchMs: round(searchMs),
        kept: ranked.length,
        rerankMs: round(rerankMs),
        strategy: this.reranker.strategy,
        // Read off the ranked set, so it describes what actually reached the
        // model rather than the best thing search happened to see.
        topSimilarity: Math.max(...ranked.map((c) => c.similarity), 0),
        threshold: minSimilarity,
      },
    };
  }

  /**
   * Never throws. Used by agent tools, where one dead retrieval path should
   * degrade that single tool rather than abort the entire answer.
   */
  async retrieveSafely(
    query: string,
    filter?: SearchFilter,
  ): Promise<RetrievalResult> {
    try {
      return await this.retrieve(query, filter);
    } catch (err) {
      this.logger.warn(
        `Retrieval failed, continuing without it: ${errorMessage(err)}`,
      );
      return EMPTY_RESULT;
    }
  }

  /**
   * Context compression — keeps only the sentences most relevant to the query.
   *
   * Long chunks dilute the prompt and widen the surface for hallucination.
   * Trimming to the highest-overlap sentences (restored to original order, so
   * the prose still reads coherently) keeps grounding tight and tokens cheap.
   */
  private compress(
    query: string,
    chunks: readonly RetrievedChunk[],
  ): RetrievedChunk[] {
    const terms = new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );

    return chunks.map((chunk) => {
      const sentences = chunk.content.split(/(?<=[.!?])\s+/);
      if (sentences.length <= COMPRESSION_THRESHOLD) return { ...chunk };

      const kept = sentences
        .map((sentence, position) => ({
          sentence,
          position,
          hits: sentence
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => terms.has(w)).length,
        }))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, MAX_SENTENCES_KEPT)
        .sort((a, b) => a.position - b.position)
        .map((s) => s.sentence);

      return { ...chunk, content: kept.join(" ") };
    });
  }
}

function toCitation(chunk: RetrievedChunk, index: number): Citation {
  return {
    index,
    chunkId: chunk.id,
    documentId: chunk.documentId,
    title: chunk.title,
    source: chunk.source,
    snippet: chunk.content.slice(0, SNIPPET_LENGTH),
    // Similarity, not the ranking score: a 0..1 number is meaningful to a
    // reader, an RRF value is not.
    score: Number(chunk.similarity.toFixed(4)),
  };
}

function renderContext(chunks: readonly RetrievedChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] (${c.docType} · ${c.source}) ${c.title}\n${c.content}`,
    )
    .join("\n\n---\n\n");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * Latencies are rendered as integers, so the fractional part is noise that
 * would only ever cause the number to jitter between renders.
 */
function round(ms: number): number {
  return Math.round(ms);
}
