/**
 * Vector embeddings.
 *
 * Query and document embeddings are separate methods on purpose: most modern
 * embedding models are asymmetric and expect a task-type hint, and collapsing
 * them into one call measurably degrades retrieval quality.
 */
export interface EmbeddingPort {
  /** Dimensionality of the produced vectors. Must match the `vector(n)` column. */
  readonly dimensions: number;

  /** Embed a search query. */
  embedQuery(text: string): Promise<number[]>;

  /** Embed a batch of documents for indexing. Order is preserved. */
  embedDocuments(texts: readonly string[]): Promise<number[][]>;
}
