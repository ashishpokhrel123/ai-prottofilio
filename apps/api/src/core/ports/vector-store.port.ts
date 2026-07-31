/** A chunk returned from the vector store, with its relevance scores. */
export interface RetrievedChunk {
  readonly id: string;
  readonly documentId: string;
  readonly content: string;
  readonly title: string;
  readonly source: string;
  readonly docType: string;
  readonly tags: readonly string[];

  /**
   * Ranking score. Ordering only — the scale differs by search strategy
   * (cosine similarity for pure vector search, Reciprocal Rank Fusion for
   * hybrid) and the re-ranker rewrites it. Never compare it to a threshold.
   */
  readonly score: number;

  /**
   * Cosine similarity in 0..1, always on the same scale and never rewritten
   * downstream. This is what confidence thresholds must be applied to.
   *
   * Separate from `score` because RRF values are ~0.016–0.033 by construction:
   * comparing them against a similarity threshold silently rejected every
   * result, whatever was indexed.
   */
  readonly similarity: number;
}

/**
 * Metadata filters. Values are validated against known enum members by the
 * adapter before they reach SQL — see `pgvector.store.ts`.
 */
export interface SearchFilter {
  readonly docTypes?: readonly string[];
  readonly sources?: readonly string[];
  readonly tags?: readonly string[];
}

/** Vector similarity storage and retrieval. Implemented by `PgVectorStore`. */
export interface VectorStorePort {
  /** Pure approximate-nearest-neighbour search by cosine distance. */
  similaritySearch(
    embedding: readonly number[],
    topK: number,
    filter?: SearchFilter,
  ): Promise<RetrievedChunk[]>;

  /**
   * Dense vector search fused with lexical full-text search via Reciprocal
   * Rank Fusion — recovers exact-keyword matches that embeddings miss.
   */
  hybridSearch(
    embedding: readonly number[],
    query: string,
    topK: number,
    filter?: SearchFilter,
  ): Promise<RetrievedChunk[]>;

  /** Attach an embedding to a previously created chunk row. */
  saveEmbedding(chunkId: string, embedding: readonly number[]): Promise<void>;

  /** Batch variant of `saveEmbedding`, in a single round trip. */
  saveEmbeddings(
    entries: readonly { chunkId: string; embedding: readonly number[] }[],
  ): Promise<void>;
}
