import { Injectable } from "@nestjs/common";
import type { RetrievedChunk } from "../../core/ports";

/** Tunable weights for the lexical re-rank. Exported so tests can assert them. */
export const RERANK_WEIGHTS = Object.freeze({
  retrieval: 0.7,
  overlap: 0.25,
  density: 0.05,
});

const MIN_TOKEN_LENGTH = 3;

/**
 * Lightweight lexical re-ranker applied after vector/hybrid retrieval.
 *
 * Boosts chunks whose terms overlap the query and mildly rewards short, dense
 * passages over long rambling ones. Deliberately cheap: it adds no network
 * call and no model download. Swapping in a cross-encoder (bge-reranker et al.)
 * means implementing this same `rerank` signature.
 */
@Injectable()
export class Reranker {
  rerank(
    query: string,
    chunks: readonly RetrievedChunk[],
    topN: number,
  ): RetrievedChunk[] {
    if (chunks.length === 0 || topN <= 0) return [];

    const terms = this.tokenize(query);

    // The incoming `score` is whatever the search strategy produced, and its
    // scale is strategy-specific: cosine similarity spans 0..1, but RRF tops
    // out near 0.033. Blending the raw value against a 0..1 overlap term let a
    // 0.25-weighted signal outweigh a 0.7-weighted one by ten to one, so
    // hybrid search's ranking was effectively discarded and the re-ranker
    // degenerated into pure keyword matching. Normalising the candidate set
    // first puts both signals on the same footing and makes the weights mean
    // what they say. (Same class of bug as the confidence gate comparing an
    // RRF score to a similarity threshold — this is the layer above it.)
    const retrieval = normalize(chunks.map((c) => c.score));

    // Only `score` is rewritten. `similarity` is the retrieval signal the
    // confidence gate reads, and blending lexical overlap into it would make
    // the threshold mean something different after every re-rank.
    const scored = chunks.map((chunk, i) => ({
      ...chunk,
      score: this.score(chunk, terms, retrieval[i]),
    }));

    return scored.sort((a, b) => b.score - a.score).slice(0, topN);
  }

  private score(
    chunk: RetrievedChunk,
    terms: readonly string[],
    retrieval: number,
  ): number {
    const words = this.tokenize(chunk.content);
    const vocabulary = new Set(words);

    const overlap =
      terms.length === 0
        ? 0
        : terms.filter((t) => vocabulary.has(t)).length / terms.length;

    // log2(n + 2) keeps the denominator >= 1 even for an empty chunk, so this
    // can never divide by zero or blow past the overlap term.
    const density = overlap / Math.log2(words.length + 2);

    return (
      retrieval * RERANK_WEIGHTS.retrieval +
      overlap * RERANK_WEIGHTS.overlap +
      density * RERANK_WEIGHTS.density
    );
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= MIN_TOKEN_LENGTH);
  }
}

/**
 * Min-max scales the candidate set to 0..1.
 *
 * Rank-relative on purpose: only the ordering within this result set matters,
 * and it makes the re-ranker independent of whichever search strategy ran.
 * A degenerate set (one candidate, or all scores equal) carries no ordering
 * information, so every entry gets the same value and the lexical terms decide.
 */
function normalize(scores: readonly number[]): number[] {
  const finite = scores.map((s) => (Number.isFinite(s) ? s : 0));
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min;

  if (range <= Number.EPSILON) return finite.map(() => 1);
  return finite.map((s) => (s - min) / range);
}
