import { Injectable } from "@nestjs/common";
import { RetrievedChunk } from "./vector.repository";

/**
 * Lightweight lexical re-ranker used after vector/hybrid retrieval.
 * Boosts chunks whose terms overlap the query and slightly rewards
 * shorter, denser passages. For production you can swap this for a
 * cross-encoder (e.g. bge-reranker) behind the same interface.
 */
@Injectable()
export class Reranker {
  rerank(
    query: string,
    chunks: RetrievedChunk[],
    topN: number,
  ): RetrievedChunk[] {
    const terms = this.tokenize(query);
    const scored = chunks.map((c) => {
      const words = this.tokenize(c.content);
      const wordSet = new Set(words);
      const overlap =
        terms.filter((t) => wordSet.has(t)).length / Math.max(terms.length, 1);
      const density = overlap / Math.log2(words.length + 2);
      const finalScore = c.score * 0.7 + overlap * 0.25 + density * 0.05;
      return { ...c, score: finalScore };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, topN);
  }

  private tokenize(s: string): string[] {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
  }
}
