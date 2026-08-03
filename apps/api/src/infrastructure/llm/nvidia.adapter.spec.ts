import type { AppConfigService } from "../../common/config/app-config.service";
import { NvidiaAdapter } from "./nvidia.adapter";

function makeConfig(
  overrides: Partial<AppConfigService["nvidia"]> = {},
): AppConfigService {
  return {
    nvidia: {
      apiKey: "nvapi-test",
      baseUrl: "https://nim.test/v1",
      llmModel: "nvidia/nemotron-3-super-120b-a12b",
      embeddingModel: "nvidia/nemotron-3-embed-1b",
      rerankBaseUrl: "https://nim.test/v1",
      rerankModel: "nvidia/llama-nemotron-rerank-1b-v2",
      dimensions: 2048,
      isConfigured: true,
      ...overrides,
    },
  } as AppConfigService;
}

/** Emits the given strings as separate reads, so frames can be split mid-JSON. */
function sseStream(parts: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const piece of gen) out += piece;
  return out;
}

describe("NvidiaAdapter", () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe("streaming", () => {
    /**
     * The regression this file exists for. A `data:` frame is routinely split
     * across two TCP reads, and parsing per-chunk drops exactly the tokens that
     * straddle the boundary — producing an answer that reads fine and is
     * quietly missing words.
     */
    it("reassembles a data frame split across two reads", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          sseStream([
            'data: {"choices":[{"delta":{"content":"pgv',
            'ector"}}]}\n',
            'data: {"choices":[{"delta":{"content":" search"}}]}\n',
            "data: [DONE]\n",
          ]),
          { status: 200 },
        ),
      );

      const adapter = new NvidiaAdapter(makeConfig());
      const text = await collect(adapter.stream("sys", [], undefined));

      expect(text).toBe("pgvector search");
    });

    it("stops at [DONE] and ignores unparseable frames", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          sseStream([
            'data: {"choices":[{"delta":{"content":"a"}}]}\n',
            "data: {not json}\n",
            'data: {"choices":[{"delta":{"content":"b"}}]}\n',
            "data: [DONE]\n",
            'data: {"choices":[{"delta":{"content":"never"}}]}\n',
          ]),
          { status: 200 },
        ),
      );

      const adapter = new NvidiaAdapter(makeConfig());

      expect(await collect(adapter.stream("sys", [], undefined))).toBe("ab");
    });

    /**
     * Reasoning models emit `reasoning_content` alongside `content`. It is
     * scratch work, and rendering it into the transcript would leak the
     * model's deliberation to a site visitor.
     */
    it("yields content deltas but never reasoning_content", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          sseStream([
            'data: {"choices":[{"delta":{"reasoning_content":"hmm, let me think"}}]}\n',
            'data: {"choices":[{"delta":{"content":"The answer."}}]}\n',
            "data: [DONE]\n",
          ]),
          { status: 200 },
        ),
      );

      const adapter = new NvidiaAdapter(makeConfig());

      expect(await collect(adapter.stream("sys", [], undefined))).toBe(
        "The answer.",
      );
    });
  });

  describe("request shape", () => {
    it("maps the port's 'model' role to OpenAI's 'assistant'", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: "ok" } }] }),
      );

      await new NvidiaAdapter(makeConfig()).complete("You are a bot.", [
        { role: "user", content: "hi" },
        { role: "model", content: "hello" },
      ]);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);

      expect(body.messages).toEqual([
        { role: "system", content: "You are a bot." },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ]);
    });

    it("omits an empty system turn rather than sending a blank one", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: "ok" } }] }),
      );

      await new NvidiaAdapter(makeConfig()).complete("   ", [
        { role: "user", content: "hi" },
      ]);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);

      expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    });

    /**
     * Nemotron-3-Embed is asymmetric: sending "passage" for a query returns a
     * valid vector that retrieves measurably worse. It never errors, so only a
     * test catches it.
     */
    it("tags queries and documents with different input_types", async () => {
      // A fresh Response per call: a body can only be read once, and this is
      // the only test here that issues two requests.
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ data: [{ index: 0, embedding: [1, 0] }] }),
        ),
      );

      const adapter = new NvidiaAdapter(makeConfig());
      await adapter.embedQuery("q");
      await adapter.embedDocuments(["d"]);

      const [first, second] = fetchMock.mock.calls.map(
        (call) => JSON.parse(call[1].body as string).input_type,
      );

      expect([first, second]).toEqual(["query", "passage"]);
    });
  });

  describe("embeddings", () => {
    /**
     * The API does not promise to return vectors in input order. Trusting
     * `data[i]` looks correct in testing and silently pairs the wrong vector
     * with the wrong chunk under concurrency.
     */
    it("reorders the response by its index field", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
      );

      const vectors = await new NvidiaAdapter(makeConfig()).embedDocuments([
        "first",
        "second",
      ]);

      expect(vectors).toEqual([
        [1, 0],
        [0, 1],
      ]);
    });

    it("returns unit vectors so RAG_MIN_SIMILARITY keeps its meaning", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ data: [{ index: 0, embedding: [3, 4] }] }),
      );

      const [vector] = await new NvidiaAdapter(makeConfig()).embedDocuments([
        "x",
      ]);

      expect(vector).toEqual([0.6, 0.8]);
    });

    it("does not call the API for an empty batch", async () => {
      expect(await new NvidiaAdapter(makeConfig()).embedDocuments([])).toEqual(
        [],
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses to embed without a key rather than sending an anonymous request", async () => {
      const adapter = new NvidiaAdapter(makeConfig({ isConfigured: false }));

      await expect(adapter.embedQuery("q")).rejects.toThrow(/not configured/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("verify", () => {
    it("fails when a configured model is absent from the catalogue", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ data: [{ id: "nvidia/nemotron-3-embed-1b" }] }),
      );

      const result = await new NvidiaAdapter(makeConfig()).verify();

      expect(result.ok).toBe(false);
      expect(result.detail).toContain("nemotron-3-super");
    });

    /**
     * Some self-hosted gateways do not implement `/models`. Reporting an
     * outage over a missing convenience endpoint would take the health check
     * red while the deployment was fine.
     */
    it("accepts an endpoint that lists no models at all", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

      expect((await new NvidiaAdapter(makeConfig()).verify()).ok).toBe(true);
    });

    it("caches the result so health polling does not spend rate limit", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

      const adapter = new NvidiaAdapter(makeConfig());
      await adapter.verify();
      await adapter.verify();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("reports missing credentials without a network call", async () => {
      const adapter = new NvidiaAdapter(makeConfig({ isConfigured: false }));

      expect(await adapter.verify()).toEqual({
        ok: false,
        detail: "NVIDIA_API_KEY is not set",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("strips a trailing slash so paths do not become double slashes", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await new NvidiaAdapter(
      makeConfig({ baseUrl: "https://nim.test/v1/" }),
    ).verify();

    expect(fetchMock.mock.calls[0][0]).toBe("https://nim.test/v1/models");
  });
});
