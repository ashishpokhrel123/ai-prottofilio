import type { RetrievedChunk } from "./vector-store.port";

/**
 * Second-stage ranking, applied to the candidate set that retrieval returned.
 *
 * Async on purpose. The original re-ranker was a synchronous lexical pass with
 * no I/O, and its signature said so — which meant a cross-encoder could not be
 * substituted without changing every caller. A port whose shape only fits the
 * cheapest implementation is not a port, so the contract is the network one and
 * the local implementation simply resolves immediately.
 *
 * Implementations must never throw. A re-ranker is a quality improvement over
 * an already-usable candidate list, so a provider outage should cost relevance,
 * not the answer. Degrade and return something ordered.
 */
export interface RerankerPort {
  /** For logs and the health endpoint, e.g. "lexical" or the NIM model id. */
  readonly strategy: string;

  /**
   * Returns at most `topN` chunks, most relevant first.
   *
   * `chunks` is the retrieval candidate set; `topN` is expected to be well
   * below `chunks.length`, since narrowing is the entire point.
   */
  rerank(
    query: string,
    chunks: readonly RetrievedChunk[],
    topN: number,
  ): Promise<RetrievedChunk[]>;
}
