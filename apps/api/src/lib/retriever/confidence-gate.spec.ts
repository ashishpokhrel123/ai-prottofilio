import type { AppConfigService } from "../../common/config/app-config.service";
import type { RetrievedChunk } from "../../core/ports";
import { FakeEmbeddings, FakeVectorStore } from "../agent/test-doubles";
import { Reranker } from "./reranker";
import { RetrieverService } from "./retriever.service";

/**
 * Regression: the confidence gate compared `score` — a *ranking* value — to
 * `RAG_MIN_SIMILARITY`, a similarity threshold.
 *
 * Hybrid search ranks with Reciprocal Rank Fusion, whose values are bounded by
 * construction: a chunk ranked first in both the vector and keyword lists
 * scores 1/61 + 1/61 ≈ 0.033. After the re-ranker blends in lexical overlap
 * the ceiling is about 0.29 — below the default 0.35 threshold. So
 * `confident` was false for every query, `knowledge_search` reported "no
 * confident matches", and the agent answered "I don't have that in my
 * knowledge base yet" no matter how good the retrieval actually was.
 */

const MIN_SIMILARITY = 0.35;

function makeConfig(minSimilarity = MIN_SIMILARITY) {
  return {
    rag: {
      topK: 8,
      rerankTopN: 4,
      chunkSize: 800,
      chunkOverlap: 120,
      minSimilarity,
    },
  } as AppConfigService;
}

/** A chunk as hybrid search returns it: tiny RRF score, real similarity. */
function hybridChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: "chunk-1",
    documentId: "doc-1",
    content: "Ashish built Immortalis, a digital legacy platform on NestJS.",
    title: "Immortalis",
    source: "GITHUB",
    docType: "README",
    tags: [],
    // 1/61 + 1/61 — ranked first in both lists, the best RRF can produce.
    score: 0.0328,
    similarity: 0.82,
    ...overrides,
  };
}

function makeRetriever(chunks: RetrievedChunk[], config = makeConfig()) {
  return new RetrieverService(
    config,
    new Reranker(),
    new FakeEmbeddings(),
    new FakeVectorStore(chunks),
  );
}

describe("retrieval confidence gate", () => {
  it("is confident about a strong match despite a tiny RRF score", async () => {
    const raw = hybridChunk();
    const result = await makeRetriever([raw]).retrieve("Immortalis");

    // The whole bug in one assertion: the value the store ranked with is far
    // below the threshold, but the similarity — what the gate actually reads —
    // is well above it. (The re-ranker rescales `score` to the candidate set,
    // so the post-rank value is deliberately not compared to the threshold;
    // that conflation is the bug this file exists to pin.)
    expect(raw.score).toBeLessThan(MIN_SIMILARITY);
    expect(result.chunks[0].similarity).toBeGreaterThan(MIN_SIMILARITY);
    expect(result.confident).toBe(true);
  });

  it("is not confident when similarity is genuinely below the floor", async () => {
    const result = await makeRetriever([
      hybridChunk({ similarity: 0.12, content: "Unrelated cooking notes." }),
    ]).retrieve("Immortalis");

    expect(result.confident).toBe(false);
  });

  it("is confident when any one chunk clears the floor", async () => {
    const result = await makeRetriever([
      hybridChunk({ id: "weak", similarity: 0.1 }),
      hybridChunk({ id: "strong", similarity: 0.77 }),
    ]).retrieve("Immortalis");

    expect(result.confident).toBe(true);
  });

  it("keeps similarity intact through re-ranking", async () => {
    // The re-ranker rewrites `score`; if it also touched `similarity` the
    // threshold would mean something different after every retrieval.
    const result = await makeRetriever([
      hybridChunk({ similarity: 0.64 }),
    ]).retrieve("Immortalis");

    expect(result.chunks[0].similarity).toBe(0.64);
  });

  it("reports similarity in citations, not the ranking score", async () => {
    const result = await makeRetriever([
      hybridChunk({ similarity: 0.71 }),
    ]).retrieve("Immortalis");

    // A 0..1 number is meaningful to a reader; an RRF value is not.
    expect(result.citations[0].score).toBeCloseTo(0.71, 4);
  });

  it("respects a raised threshold", async () => {
    const result = await makeRetriever(
      [hybridChunk({ similarity: 0.5 })],
      makeConfig(0.9),
    ).retrieve("Immortalis");

    expect(result.confident).toBe(false);
  });

  it("treats a keyword-only match (no embedding) as unconfident", async () => {
    // Such rows come back with similarity coalesced to 0 in SQL.
    const result = await makeRetriever([
      hybridChunk({ similarity: 0 }),
    ]).retrieve("Immortalis");

    expect(result.confident).toBe(false);
    // But it is still returned, so a lexical hit can inform the answer.
    expect(result.chunks).toHaveLength(1);
  });
});
