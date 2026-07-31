import type { Citation } from "@ai-portfolio/shared";
import type { MemoryService } from "../memory/memory.service";
import { AgentOrchestrator } from "./agent.orchestrator";
import type { IntentDetector } from "./intent.detector";
import type { Planner } from "./planner";
import type { Synthesizer } from "./synthesizer";
import type { ToolExecutor } from "./tool.executor";
import type { AgentEvent, Intent, Plan, ToolOutcome } from "./agent.types";

const CONVERSATION = "conv-1";

function makeIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    intent: "projects",
    needsRetrieval: true,
    entities: [],
    resolvedQuery: "what projects?",
    ...overrides,
  };
}

function citation(chunkId: string, index = 1): Citation {
  return {
    index,
    chunkId,
    documentId: "doc",
    title: "title",
    source: "MANUAL_UPLOAD",
    snippet: "snippet",
    score: 0.9,
  };
}

/** Assembles an orchestrator from stubbed pipeline nodes. */
function makeOrchestrator(options: {
  intent?: Intent;
  outcomes?: ToolOutcome[];
  citations?: Citation[];
  plans?: Plan[];
}) {
  const plans = options.plans ?? [
    { reason: "test", steps: [{ tool: "project_search", input: "q" }] },
  ];
  let planCall = 0;

  const synthesisCalls: { grounded: boolean }[] = [];

  const intentDetector = {
    detect: jest.fn().mockResolvedValue(options.intent ?? makeIntent()),
  } as unknown as IntentDetector;

  const planner = {
    plan: jest.fn(() =>
      Promise.resolve(plans[Math.min(planCall++, plans.length - 1)]),
    ),
  } as unknown as Planner;

  const executor = {
    // eslint-disable-next-line @typescript-eslint/require-await
    execute: async function* () {
      yield { type: "tool_start", tool: "project_search" } as AgentEvent;
      yield { type: "tool_end", tool: "project_search" } as AgentEvent;
      return {
        outcomes: options.outcomes ?? [],
        citations: options.citations ?? [],
      };
    },
  } as unknown as ToolExecutor;

  const synthesizer = {
    synthesize: async function* (input: { grounded: boolean }) {
      synthesisCalls.push({ grounded: input.grounded });
      yield { type: "token", content: "answer" } as AgentEvent;
      return { text: "answer" };
    },
  } as unknown as Synthesizer;

  const memory = {
    load: jest.fn().mockResolvedValue({ history: [], lastEntities: [] }),
    append: jest.fn().mockResolvedValue("message-1"),
  } as unknown as MemoryService;

  const orchestrator = new AgentOrchestrator(
    intentDetector,
    planner,
    executor,
    synthesizer,
    memory,
  );

  return { orchestrator, planner, memory, synthesisCalls };
}

async function collect(
  generator: AsyncGenerator<AgentEvent>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe("AgentOrchestrator", () => {
  describe("small talk", () => {
    it("skips planning and tools entirely", async () => {
      const { orchestrator, planner, synthesisCalls } = makeOrchestrator({
        intent: makeIntent({ intent: "smalltalk", needsRetrieval: false }),
      });

      const events = await collect(orchestrator.run("hi", CONVERSATION));

      expect(planner.plan).not.toHaveBeenCalled();
      expect(events.some((e) => e.type === "tool_start")).toBe(false);
      // Answered without retrieval, so it must not claim to be grounded.
      expect(synthesisCalls[0].grounded).toBe(false);
    });
  });

  describe("confidence gate", () => {
    it("is grounded when a tool returns substantial content", async () => {
      const { orchestrator, synthesisCalls } = makeOrchestrator({
        outcomes: [
          { tool: "project_search", text: "A long, genuinely useful answer." },
        ],
      });

      await collect(orchestrator.run("q", CONVERSATION));
      expect(synthesisCalls[0].grounded).toBe(true);
    });

    /**
     * Regression: "GitHub has not been synced yet." is 31 characters, so
     * before `failed` was honoured it cleared the length threshold and an
     * empty knowledge base reported itself as grounded.
     */
    it("is not grounded when the only outcome is a failed tool", async () => {
      const { orchestrator, synthesisCalls } = makeOrchestrator({
        outcomes: [
          {
            tool: "github_tool",
            text: "GitHub has not been synced yet.",
            failed: true,
          },
        ],
      });

      await collect(orchestrator.run("q", CONVERSATION));
      expect(synthesisCalls[0].grounded).toBe(false);
    });

    it("is not grounded when outcomes are too short to be useful", async () => {
      const { orchestrator, synthesisCalls } = makeOrchestrator({
        outcomes: [{ tool: "project_search", text: "none" }],
      });

      await collect(orchestrator.run("q", CONVERSATION));
      expect(synthesisCalls[0].grounded).toBe(false);
    });
  });

  describe("citations", () => {
    it("de-duplicates by chunk id and renumbers sequentially", async () => {
      const { orchestrator } = makeOrchestrator({
        outcomes: [
          { tool: "project_search", text: "long enough content here" },
        ],
        citations: [citation("a", 1), citation("b", 2), citation("a", 3)],
      });

      const events = await collect(orchestrator.run("q", CONVERSATION));
      const emitted = events.find((e) => e.type === "citations");

      expect(emitted).toBeDefined();
      const list = (emitted as { citations: readonly Citation[] }).citations;

      expect(list.map((c) => c.chunkId)).toEqual(["a", "b"]);
      // Indexes must be contiguous: they map to the [n] markers in the prompt.
      expect(list.map((c) => c.index)).toEqual([1, 2]);
    });

    it("emits no citations event when there are none", async () => {
      const { orchestrator } = makeOrchestrator({ outcomes: [] });

      const events = await collect(orchestrator.run("q", CONVERSATION));
      expect(events.some((e) => e.type === "citations")).toBe(false);
    });
  });

  describe("reflection loop", () => {
    it("re-plans once for job_fit when the resume is missing", async () => {
      const { orchestrator, planner } = makeOrchestrator({
        intent: makeIntent({ intent: "job_fit" }),
        outcomes: [{ tool: "skills_tool", text: "some skills listed here" }],
      });

      await collect(orchestrator.run("job description", CONVERSATION));

      // Bounded at MAX_ITERATIONS — an unbounded agent loop is a cost incident.
      expect(planner.plan).toHaveBeenCalledTimes(2);
    });

    it("does not loop when the resume was retrieved", async () => {
      const { orchestrator, planner } = makeOrchestrator({
        intent: makeIntent({ intent: "job_fit" }),
        outcomes: [
          {
            tool: "resume_tool",
            text: "A resume long enough to clear the forty character bar.",
          },
        ],
      });

      await collect(orchestrator.run("job description", CONVERSATION));
      expect(planner.plan).toHaveBeenCalledTimes(1);
    });

    it("does not loop for other intents", async () => {
      const { orchestrator, planner } = makeOrchestrator({ outcomes: [] });

      await collect(orchestrator.run("q", CONVERSATION));
      expect(planner.plan).toHaveBeenCalledTimes(1);
    });
  });

  describe("persistence and completion", () => {
    it("persists the answer and emits done with the message id", async () => {
      const { orchestrator, memory } = makeOrchestrator({
        outcomes: [
          { tool: "project_search", text: "long enough content here" },
        ],
      });

      const events = await collect(orchestrator.run("q", CONVERSATION));

      expect(memory.append).toHaveBeenCalledWith(
        CONVERSATION,
        "assistant",
        "answer",
        expect.objectContaining({ toolTrace: ["project_search"] }),
      );
      expect(events[events.length - 1]).toEqual({
        type: "done",
        messageId: "message-1",
      });
    });
  });

  describe("failure handling", () => {
    it("emits an error event instead of throwing", async () => {
      const { orchestrator } = makeOrchestrator({});
      (orchestrator as unknown as { intentDetector: { detect: jest.Mock } })[
        "intentDetector"
      ].detect.mockRejectedValue(new Error("catastrophe"));

      const events = await collect(orchestrator.run("q", CONVERSATION));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      // The raw cause belongs in the logs, not the chat window.
      expect(JSON.stringify(events[0])).not.toContain("catastrophe");
    });
  });
});
