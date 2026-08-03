import type { AppConfigService } from "../../common/config/app-config.service";
import type { RetrievedChunk } from "../../core/ports";
import { Reranker } from "../../lib/retriever/reranker";
import { NvidiaReranker } from "./nvidia.reranker";

function makeConfig(): AppConfigService {
  return {
    nvidia: {
      apiKey: "nvapi-test",
      baseUrl: "https://nim.test/v1",
      llmModel: "nvidia/nemotron-3-super-120b-a12b",
      embeddingModel: "nvidia/nemotron-3-embed-1b",
      rerankBaseUrl: "https://nim.test/v1",
      rerankModel: "nvidia/llama-nemotron-rerank-1b-v2",
      rerankPath: "/retrieval/nvidia/llama-nemotron-rerank-1b-v2/reranking",
      dimensions: 2048,
      isConfigured: true,
    },
  } as AppConfigService;
}

function chunk(id: string, content: string, score = 0.5): RetrievedChunk {
  return {
    id,
    documentId: "doc-1",
    content,
    title: "title",
    source: "MANUAL_UPLOAD",
    docType: "PROJECT",
    tags: [],
    score,
    similarity: score,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("NvidiaReranker", () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  const make = () => new NvidiaReranker(makeConfig(), new Reranker());

  const chunks = [
    chunk("a", "Deployment runs behind Caddy, which provisions TLS."),
    chunk("b", "Chunks live in Postgres with pgvector, searched by cosine."),
  ];

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("orders chunks by the returned logits, not by response order", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        rankings: [
          { index: 0, logit: -2.5 },
          { index: 1, logit: 4.1 },
        ],
      }),
    );

    const ranked = await make().rerank("where are chunks stored?", chunks, 2);

    expect(ranked.map((c) => c.id)).toEqual(["b", "a"]);
  });

  /**
   * `similarity` is the retrieval signal the confidence gate reads. A
   * cross-encoder logit is a different quantity on a different scale, so
   * writing it there would silently redefine what RAG_MIN_SIMILARITY means.
   */
  it("rewrites score but leaves similarity untouched", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        rankings: [
          { index: 0, logit: -2.5 },
          { index: 1, logit: 4.1 },
        ],
      }),
    );

    const ranked = await make().rerank("q", chunks, 2);

    expect(ranked.map((c) => c.similarity)).toEqual([0.5, 0.5]);
    expect(ranked.map((c) => c.score)).toEqual([1, 0]);
  });

  it("respects topN", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        rankings: [
          { index: 0, logit: 1 },
          { index: 1, logit: 2 },
        ],
      }),
    );

    expect(await make().rerank("q", chunks, 1)).toHaveLength(1);
  });

  describe("degradation", () => {
    /**
     * Re-ranking refines an already-usable list. An outage or a burnt rate
     * limit should cost relevance, never the answer — so every failure path
     * lands on the local lexical pass rather than propagating.
     */
    it("falls back to lexical ranking when the endpoint errors", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "rate limited" }, 429));

      const ranked = await make().rerank("pgvector cosine", chunks, 2);

      expect(ranked.map((c) => c.id)).toEqual(["b", "a"]);
    });

    it("falls back when the network call throws", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNRESET"));

      const ranked = await make().rerank("pgvector cosine", chunks, 2);

      expect(ranked.map((c) => c.id)).toEqual(["b", "a"]);
    });

    /** A 200 with an unrecognised shape is the quiet failure worth catching. */
    it("falls back when the response contains no usable rankings", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [] }));

      const ranked = await make().rerank("pgvector cosine", chunks, 2);

      expect(ranked.map((c) => c.id)).toEqual(["b", "a"]);
    });

    it("ignores indices that reference chunks it never sent", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          rankings: [
            { index: 99, logit: 9 },
            { index: 1, logit: 1 },
          ],
        }),
      );

      const ranked = await make().rerank("q", chunks, 2);

      expect(ranked.map((c) => c.id)).toEqual(["b"]);
    });
  });

  describe("shortcuts", () => {
    it("skips the round-trip for a single candidate", async () => {
      expect(await make().rerank("q", [chunks[0]], 4)).toHaveLength(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns empty for no candidates or a zero topN", async () => {
      expect(await make().rerank("q", [], 4)).toEqual([]);
      expect(await make().rerank("q", chunks, 0)).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("sends the query and passages in the shape the ranking NIM expects", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ rankings: [{ index: 0, logit: 1 }] }),
    );

    await make().rerank("where are chunks stored?", chunks, 2);

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);

    // Per-model path, not a flat /ranking — the hosted API routes each rerank
    // model separately, and the flat route 404s there.
    expect(url).toBe(
      "https://nim.test/v1/retrieval/nvidia/llama-nemotron-rerank-1b-v2/reranking",
    );
    expect(body.model).toBe("nvidia/llama-nemotron-rerank-1b-v2");
    expect(body.query).toEqual({ text: "where are chunks stored?" });
    expect(body.passages).toEqual(chunks.map((c) => ({ text: c.content })));
  });
});
