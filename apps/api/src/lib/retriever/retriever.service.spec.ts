import type { AppConfigService } from "../../common/config/app-config.service";
import {
  FakeEmbeddings,
  FakeVectorStore,
  makeChunk,
} from "../agent/test-doubles";
import { Reranker } from "./reranker";
import { RetrieverService } from "./retriever.service";

function makeConfig(overrides: Partial<AppConfigService["rag"]> = {}) {
  return {
    rag: {
      topK: 8,
      rerankTopN: 4,
      chunkSize: 800,
      chunkOverlap: 120,
      minSimilarity: 0.35,
      ...overrides,
    },
  } as AppConfigService;
}

function makeRetriever(chunks = [makeChunk()], config = makeConfig()) {
  const embeddings = new FakeEmbeddings();
  const vectors = new FakeVectorStore(chunks);

  return {
    retriever: new RetrieverService(
      config,
      new Reranker(),
      embeddings,
      vectors,
    ),
    embeddings,
    vectors,
  };
}

describe("RetrieverService", () => {
  it("returns empty for a blank query without touching the store", async () => {
    const { retriever, embeddings } = makeRetriever();

    const result = await retriever.retrieve("   ");

    expect(result.chunks).toEqual([]);
    expect(result.confident).toBe(false);
    expect(embeddings.queries).toHaveLength(0);
  });

  it("returns empty when the store has no hits", async () => {
    const { retriever } = makeRetriever([]);

    expect((await retriever.retrieve("anything")).confident).toBe(false);
  });

  it("builds numbered citations aligned with the context markers", async () => {
    const { retriever } = makeRetriever([
      makeChunk({ id: "a", title: "First" }),
      makeChunk({ id: "b", title: "Second", content: "pgvector retrieval" }),
    ]);

    const result = await retriever.retrieve("pgvector");

    expect(result.citations).toHaveLength(2);
    expect(result.citations.map((c) => c.index)).toEqual([1, 2]);
    // The [n] markers the model sees must match the citation list the UI shows.
    expect(result.context).toContain("[1]");
    expect(result.context).toContain("[2]");
  });

  it("marks results below the similarity floor as not confident", async () => {
    const { retriever } = makeRetriever(
      // `similarity` is what the gate reads — `score` is only a ranking value.
      [makeChunk({ similarity: 0.01, content: "totally unrelated text" })],
      makeConfig({ minSimilarity: 0.9 }),
    );

    expect((await retriever.retrieve("pgvector")).confident).toBe(false);
  });

  it("stays confident when only the ranking score is low", async () => {
    // Hybrid search returns RRF values around 0.03. Treating those as
    // similarities rejected every result the store returned.
    const { retriever } = makeRetriever(
      [makeChunk({ score: 0.0328, similarity: 0.8 })],
      makeConfig({ minSimilarity: 0.35 }),
    );

    expect((await retriever.retrieve("pgvector")).confident).toBe(true);
  });

  it("respects rerankTopN", async () => {
    const chunks = Array.from({ length: 8 }, (_, i) =>
      makeChunk({ id: `c${i}`, score: 0.9 - i * 0.05 }),
    );
    const { retriever } = makeRetriever(chunks, makeConfig({ rerankTopN: 3 }));

    expect((await retriever.retrieve("pgvector")).chunks).toHaveLength(3);
  });

  it("truncates citation snippets", async () => {
    const { retriever } = makeRetriever([
      makeChunk({ content: "pgvector ".repeat(200) }),
    ]);

    expect(
      (await retriever.retrieve("pgvector")).citations[0].snippet.length,
    ).toBeLessThanOrEqual(220);
  });

  describe("retrieveSafely", () => {
    it("swallows store failures and returns an empty result", async () => {
      const { retriever, vectors } = makeRetriever();
      jest
        .spyOn(vectors, "hybridSearch")
        .mockRejectedValue(new Error("pgvector is down"));

      // One dead retrieval path must degrade that tool, not the whole answer.
      const result = await retriever.retrieveSafely("pgvector");

      expect(result.chunks).toEqual([]);
      expect(result.confident).toBe(false);
    });

    it("still throws from the unsafe variant", async () => {
      const { retriever, vectors } = makeRetriever();
      jest
        .spyOn(vectors, "hybridSearch")
        .mockRejectedValue(new Error("pgvector is down"));

      await expect(retriever.retrieve("pgvector")).rejects.toThrow(
        "pgvector is down",
      );
    });
  });

  /**
   * These stats are rendered to visitors as a factual record of the run, so
   * the contract they have to hold to is narrow: every number is measured from
   * this call, and a stage that did not happen reports nothing rather than
   * reporting a zero.
   */
  describe("telemetry", () => {
    it("reports the width the embedder actually returned", async () => {
      const { retriever } = makeRetriever();

      const { stats } = await retriever.retrieve("pgvector");

      // The fake returns a 4-vector. Read off the response, not from config —
      // an EMBEDDING_DIMENSIONS that disagrees with the provider is exactly
      // the bug this number exists to expose.
      expect(stats?.dimensions).toBe(4);
    });

    it("reports the candidate count and what survived the re-rank", async () => {
      const { retriever } = makeRetriever(
        [
          makeChunk({ id: "a" }),
          makeChunk({ id: "b" }),
          makeChunk({ id: "c" }),
        ],
        makeConfig({ rerankTopN: 2 }),
      );

      const { stats } = await retriever.retrieve("pgvector");

      expect(stats?.candidates).toBe(3);
      expect(stats?.kept).toBe(2);
      expect(stats?.strategy).toBe("lexical");
      expect(stats?.threshold).toBe(0.35);
    });

    it("carries the threshold the gate was compared against", async () => {
      const { retriever } = makeRetriever(
        [makeChunk({ similarity: 0.42 })],
        makeConfig({ minSimilarity: 0.77 }),
      );

      const { stats } = await retriever.retrieve("pgvector");

      // Both halves of the comparison, so the UI can draw the bar and the
      // floor on one axis without re-deriving either from config.
      expect(stats?.threshold).toBe(0.77);
      expect(stats?.topSimilarity).toBe(0.42);
    });

    it("reports the best similarity that reached the model", async () => {
      const { retriever } = makeRetriever([
        makeChunk({ id: "a", similarity: 0.31 }),
        makeChunk({ id: "b", similarity: 0.88 }),
      ]);

      const { stats } = await retriever.retrieve("pgvector");

      expect(stats?.topSimilarity).toBe(0.88);
    });

    /**
     * "Searched and matched nothing" and "never searched" render as different
     * traces, so they have to be distinguishable here.
     */
    it("reports a zero-candidate search, but omits stats when nothing ran", async () => {
      const { retriever } = makeRetriever([]);
      const searched = await retriever.retrieve("pgvector");

      expect(searched.stats?.candidates).toBe(0);
      expect(searched.stats?.dimensions).toBe(4);

      // A blank query short-circuits before any work happens.
      expect((await retriever.retrieve("   ")).stats).toBeUndefined();
    });

    it("omits stats when retrieval failed rather than reporting zeroes", async () => {
      const { retriever, vectors } = makeRetriever();
      jest
        .spyOn(vectors, "hybridSearch")
        .mockRejectedValue(new Error("pgvector is down"));

      expect((await retriever.retrieveSafely("pgvector")).stats).toBeUndefined();
    });

    it("reports latencies as non-negative integers", async () => {
      const { retriever } = makeRetriever();

      const { stats } = await retriever.retrieve("pgvector");

      for (const ms of [stats!.embedMs, stats!.searchMs, stats!.rerankMs]) {
        expect(Number.isInteger(ms)).toBe(true);
        expect(ms).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
