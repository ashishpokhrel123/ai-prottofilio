import type { ToolRegistry } from "../tools/tool.registry";
import type { Tool, ToolOutput } from "../tools/tool.interface";
import { ToolExecutor, type ExecutionResult } from "./tool.executor";
import type { AgentEvent, Plan } from "./agent.types";

function makeTool(name: string, output: ToolOutput | Error): Tool {
  return {
    name,
    description: `${name} description`,
    run: async () => {
      if (output instanceof Error) throw output;
      return output;
    },
  };
}

function makeRegistry(tools: Tool[]): ToolRegistry {
  const map = new Map(tools.map((t) => [t.name, t]));
  return { get: (name: string) => map.get(name) } as unknown as ToolRegistry;
}

const plan = (...names: string[]): Plan => ({
  reason: "test",
  steps: names.map((tool) => ({ tool, input: "q" })),
});

const CONTEXT = { query: "q", conversationId: "c1" };

/** Drains the generator, returning both the events and the final result. */
async function run(
  executor: ToolExecutor,
  p: Plan,
): Promise<{ events: AgentEvent[]; result: ExecutionResult }> {
  const iterator = executor.execute(p, CONTEXT);
  const events: AgentEvent[] = [];

  let next = await iterator.next();
  while (!next.done) {
    events.push(next.value);
    next = await iterator.next();
  }

  return { events, result: next.value };
}

/**
 * The lifecycle events, with telemetry filtered out.
 *
 * `trace` is observational: it carries measured latencies that legitimately
 * differ between runs. Asserting on it inside a structural test would make
 * that test both flaky and about the wrong thing, so the trace gets its own
 * assertions below and the lifecycle tests ignore it.
 */
function lifecycle(events: AgentEvent[]): AgentEvent[] {
  return events.filter((e) => e.type !== "trace");
}

const traces = (events: AgentEvent[]) =>
  events.filter((e): e is Extract<AgentEvent, { type: "trace" }> =>
    e.type === "trace",
  );

const RETRIEVAL_STATS = {
  dimensions: 2048,
  embedMs: 18,
  candidates: 8,
  searchMs: 42,
  kept: 4,
  rerankMs: 210,
  strategy: "nvidia/llama-nemotron-rerank-1b-v2",
  topSimilarity: 0.71,
  threshold: 0.35,
};

describe("ToolExecutor", () => {
  it("emits start and end events around each tool", async () => {
    const executor = new ToolExecutor(
      makeRegistry([makeTool("alpha", { ok: true, text: "some content" })]),
    );

    const { events } = await run(executor, plan("alpha"));

    expect(lifecycle(events)).toEqual([
      { type: "tool_start", tool: "alpha" },
      { type: "tool_end", tool: "alpha" },
    ]);
  });

  describe("telemetry", () => {
    it("times every tool, whether or not it retrieved", async () => {
      const executor = new ToolExecutor(
        makeRegistry([makeTool("alpha", { ok: true, text: "content" })]),
      );

      const { events } = await run(executor, plan("alpha"));
      const [stage] = traces(events);

      expect(stage.trace.stage).toBe("tool");
      expect(stage.trace.ms).toBeGreaterThanOrEqual(0);
      expect(stage.trace.detail?.tools).toEqual(["alpha"]);
    });

    /**
     * The trace is rendered to visitors as a factual record of the run, so the
     * numbers must be the ones retrieval measured — not re-derived, rounded or
     * approximated on the way through.
     */
    it("forwards measured retrieval numbers unchanged", async () => {
      const executor = new ToolExecutor(
        makeRegistry([
          makeTool("alpha", {
            ok: true,
            text: "content",
            retrieval: RETRIEVAL_STATS,
          }),
        ]),
      );

      const { events } = await run(executor, plan("alpha"));
      const stages = traces(events).map((e) => e.trace);

      const retrieve = stages.find((s) => s.stage === "retrieve");
      expect(retrieve?.ms).toBe(60); // embedMs + searchMs, not an estimate
      expect(retrieve?.detail?.dimensions).toBe(2048);
      expect(retrieve?.detail?.candidates).toBe(8);

      const rerank = stages.find((s) => s.stage === "rerank");
      expect(rerank?.ms).toBe(210);
      expect(rerank?.detail?.kept).toBe(4);
      expect(rerank?.detail?.topSimilarity).toBe(0.71);
      expect(rerank?.detail?.strategy).toBe(RETRIEVAL_STATS.strategy);
    });

    /** 0.71 ≥ 0.35, so the gate opened. */
    it("derives the confidence verdict from the similarity and the floor", async () => {
      const executor = new ToolExecutor(
        makeRegistry([
          makeTool("alpha", {
            ok: true,
            text: "c",
            retrieval: { ...RETRIEVAL_STATS, topSimilarity: 0.2 },
          }),
        ]),
      );

      const { events } = await run(executor, plan("alpha"));
      const rerank = traces(events).find((e) => e.trace.stage === "rerank");

      expect(rerank?.trace.detail?.grounded).toBe(false);
    });

    /**
     * Re-ranking zero candidates is not a 0ms re-rank — it is a stage that did
     * not happen, and drawing it would imply work the system never did.
     */
    it("omits the rerank stage when the search matched nothing", async () => {
      const executor = new ToolExecutor(
        makeRegistry([
          makeTool("alpha", {
            ok: false,
            text: "nothing found",
            retrieval: {
              ...RETRIEVAL_STATS,
              candidates: 0,
              kept: 0,
              rerankMs: 0,
              topSimilarity: 0,
            },
          }),
        ]),
      );

      const { events } = await run(executor, plan("alpha"));
      const stages = traces(events).map((s) => s.trace.stage);

      expect(stages).toContain("retrieve");
      expect(stages).not.toContain("rerank");
    });

    /** A tool that never touched the vector store must not invent a stage. */
    it("emits no retrieval stages for a non-retrieving tool", async () => {
      const executor = new ToolExecutor(
        makeRegistry([makeTool("alpha", { ok: true, text: "content" })]),
      );

      const { events } = await run(executor, plan("alpha"));
      const stages = traces(events).map((s) => s.trace.stage);

      expect(stages).toEqual(["tool"]);
    });
  });

  it("collects citations from successful tools", async () => {
    const citation = {
      index: 1,
      chunkId: "c",
      documentId: "d",
      title: "t",
      source: "s",
      snippet: "sn",
      score: 0.9,
    };

    const executor = new ToolExecutor(
      makeRegistry([
        makeTool("alpha", { ok: true, text: "content", citations: [citation] }),
      ]),
    );

    const { result } = await run(executor, plan("alpha"));
    expect(result.citations).toEqual([citation]);
  });

  it("carries a successful tool's structured data on tool_end", async () => {
    const data = [{ id: "p1", name: "Immortalis" }];
    const executor = new ToolExecutor(
      makeRegistry([makeTool("alpha", { ok: true, text: "content", data })]),
    );

    const { events } = await run(executor, plan("alpha"));

    expect(events).toContainEqual({ type: "tool_end", tool: "alpha", data });
  });

  it("omits data when a tool found nothing", async () => {
    // `ok: false` means the text is a status line, not knowledge. Rendering a
    // card from it would contradict the answer the model was told to give.
    const executor = new ToolExecutor(
      makeRegistry([
        makeTool("alpha", {
          ok: false,
          text: "No projects recorded.",
          data: [],
        }),
      ]),
    );

    const { events } = await run(executor, plan("alpha"));
    const end = events.find((e) => e.type === "tool_end");

    expect(end).toEqual({ type: "tool_end", tool: "alpha" });
  });

  it("omits data when a tool throws", async () => {
    const executor = new ToolExecutor(
      makeRegistry([makeTool("alpha", new Error("boom"))]),
    );

    const { events } = await run(executor, plan("alpha"));
    const end = events.find((e) => e.type === "tool_end");

    expect(end).toEqual({ type: "tool_end", tool: "alpha" });
  });

  it("does not leak one tool's data onto the next tool's event", async () => {
    const executor = new ToolExecutor(
      makeRegistry([
        makeTool("alpha", { ok: true, text: "a", data: { from: "alpha" } }),
        makeTool("beta", { ok: true, text: "b" }),
      ]),
    );

    const { events } = await run(executor, plan("alpha", "beta"));
    const ends = events.filter((e) => e.type === "tool_end");

    expect(ends).toEqual([
      { type: "tool_end", tool: "alpha", data: { from: "alpha" } },
      { type: "tool_end", tool: "beta" },
    ]);
  });

  it("skips unknown tools without emitting events", async () => {
    const executor = new ToolExecutor(makeRegistry([]));
    const { events, result } = await run(executor, plan("ghost"));

    expect(events).toEqual([]);
    expect(result.outcomes).toEqual([]);
  });

  it("isolates a throwing tool and keeps going", async () => {
    const executor = new ToolExecutor(
      makeRegistry([
        makeTool("broken", new Error("vector store is down")),
        makeTool("working", { ok: true, text: "real content here" }),
      ]),
    );

    const { result } = await run(executor, plan("broken", "working"));

    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes[0]).toMatchObject({ tool: "broken", failed: true });
    expect(result.outcomes[1]).toMatchObject({
      tool: "working",
      failed: false,
    });
  });

  /**
   * Regression: `ToolOutput.ok` used to be ignored entirely, so a tool
   * reporting "GitHub has not been synced yet." had that sentence injected
   * into the synthesis prompt as retrieved knowledge — and, being longer than
   * the 20-character confidence threshold, it also made an empty knowledge
   * base register as "grounded".
   */
  it("marks ok:false outcomes as failed even when the message is long", async () => {
    const message = "GitHub has not been synced yet.";
    expect(message.length).toBeGreaterThan(20);

    const executor = new ToolExecutor(
      makeRegistry([makeTool("github_tool", { ok: false, text: message })]),
    );

    const { result } = await run(executor, plan("github_tool"));

    expect(result.outcomes[0].failed).toBe(true);
  });
});
