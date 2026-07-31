import type { RetrievedChunk } from "../../core/ports";
import { Reranker } from "./reranker";

describe("Reranker", () => {
  const reranker = new Reranker();

  const chunk = (
    id: string,
    content: string,
    score: number,
    similarity = score,
  ): RetrievedChunk => ({
    id,
    documentId: "doc-1",
    content,
    title: "title",
    source: "MANUAL_UPLOAD",
    docType: "PROJECT",
    tags: [],
    score,
    similarity,
  });

  it("promotes the chunk that overlaps the query terms", () => {
    const chunks = [
      chunk("irrelevant", "This talks about cooking pasta and food.", 0.5),
      chunk(
        "relevant",
        "The Immortalis project uses pgvector and NestJS for RAG.",
        0.5,
      ),
    ];

    const ranked = reranker.rerank(
      "Tell me about the Immortalis pgvector project",
      chunks,
      2,
    );

    expect(ranked[0].id).toBe("relevant");
  });

  it("respects topN", () => {
    const chunks = [
      chunk("a", "alpha", 0.9),
      chunk("b", "beta", 0.8),
      chunk("c", "gamma", 0.7),
    ];

    expect(reranker.rerank("anything", chunks, 2)).toHaveLength(2);
  });

  it("returns an empty array for empty input", () => {
    expect(reranker.rerank("query", [], 5)).toEqual([]);
    expect(reranker.rerank("query", [chunk("a", "x", 1)], 0)).toEqual([]);
  });

  it("does not mutate the input chunks", () => {
    const original = chunk("a", "pgvector retrieval", 0.5);
    const chunks = [original];

    reranker.rerank("pgvector", chunks, 1);

    expect(original.score).toBe(0.5);
  });

  /**
   * Regression: the retrieval signal was blended in at its raw scale. Hybrid
   * search ranks with RRF, whose best possible value is ~0.033, so the
   * 0.7-weighted retrieval term contributed at most 0.023 while the
   * 0.25-weighted lexical overlap contributed up to 0.25 — an order of
   * magnitude more. The vector ranking was effectively thrown away and a
   * keyword-stuffed chunk beat the top semantic match every time.
   */
  it("keeps the retrieval ranking meaningful at RRF scale", () => {
    const ranked = reranker.rerank(
      "pgvector",
      [
        // Ranked last by retrieval, but repeats the query term.
        chunk("keyword-stuffed", "pgvector pgvector pgvector", 0.008),
        // Ranked first in both lists — the best RRF can produce.
        chunk(
          "top-retrieved",
          "The Immortalis platform stores embeddings for semantic search.",
          0.0328,
        ),
      ],
      2,
    );

    expect(ranked[0].id).toBe("top-retrieved");
  });

  it("normalises the retrieval signal across the candidate set", () => {
    // Identical ordering, different scales: cosine 0..1 vs RRF ~0.02.
    const byScale = (a: number, b: number) =>
      reranker
        .rerank(
          "alpha",
          [chunk("low", "gamma delta", a), chunk("high", "alpha beta", b)],
          2,
        )
        .map((c) => c.id);

    expect(byScale(0.2, 0.9)).toEqual(byScale(0.016, 0.032));
  });

  it("falls back to the lexical signal when every score is identical", () => {
    const ranked = reranker.rerank(
      "pgvector retrieval",
      [
        chunk("a", "cooking pasta and food", 0.02),
        chunk("b", "pgvector retrieval internals", 0.02),
      ],
      2,
    );

    expect(ranked[0].id).toBe("b");
  });

  it("preserves retrieval order when no query terms match", () => {
    const ranked = reranker.rerank(
      "zzz",
      [chunk("high", "alpha beta", 0.9), chunk("low", "gamma delta", 0.1)],
      2,
    );

    expect(ranked.map((c) => c.id)).toEqual(["high", "low"]);
  });
});
