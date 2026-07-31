import { Planner } from "./planner";
import { FakeLlm } from "./test-doubles";
import type { ToolCatalogue } from "./tool-catalogue";
import type { Intent, IntentName } from "./agent.types";

/**
 * Stub catalogue. Because `Planner` depends on the narrow `ToolCatalogue`
 * interface, this test needs neither Prisma nor the twelve real tools.
 */
function makeRegistry(known: string[]): ToolCatalogue {
  return {
    has: (name) => known.includes(name),
    catalogue: () => known.map((n) => `- ${n}: does something`).join("\n"),
  };
}

const intent = (name: IntentName, query = "a question"): Intent => ({
  intent: name,
  needsRetrieval: true,
  entities: [],
  resolvedQuery: query,
});

const ALL_TOOLS = [
  "knowledge_search",
  "project_search",
  "resume_tool",
  "skills_tool",
  "job_description_analyzer",
  "contact_tool",
  "github_tool",
  "experience_tool",
];

describe("Planner", () => {
  describe("deterministic fast paths", () => {
    it("plans the job-fit chain without a model call", async () => {
      const llm = new FakeLlm();
      const plan = await new Planner(llm, makeRegistry(ALL_TOOLS)).plan(
        intent("job_fit"),
      );

      expect(plan.steps.map((s) => s.tool)).toEqual([
        "job_description_analyzer",
        "resume_tool",
        "skills_tool",
        "project_search",
      ]);
      // The whole point of a fast path is skipping the planning round trip.
      expect(llm.completions).toHaveLength(0);
    });

    it.each<[IntentName, string]>([
      ["skills", "skills_tool"],
      ["experience", "experience_tool"],
      ["contact", "contact_tool"],
      ["github", "github_tool"],
    ])("plans %s directly to %s", async (name, tool) => {
      const plan = await new Planner(
        new FakeLlm(),
        makeRegistry(ALL_TOOLS),
      ).plan(intent(name));

      expect(plan.steps[0].tool).toBe(tool);
    });

    it("passes the resolved query as each step's input", async () => {
      const plan = await new Planner(
        new FakeLlm(),
        makeRegistry(ALL_TOOLS),
      ).plan(intent("projects", "tell me about Immortalis"));

      for (const step of plan.steps) {
        expect(step.input).toBe("tell me about Immortalis");
      }
    });
  });

  describe("model-driven planning", () => {
    it("uses the model's plan for open-ended intents", async () => {
      const llm = new FakeLlm({
        complete:
          '{"steps":[{"tool":"knowledge_search","input":"x"},{"tool":"project_search","input":"y"}],"reason":"combined"}',
      });

      const plan = await new Planner(llm, makeRegistry(ALL_TOOLS)).plan(
        intent("other"),
      );

      expect(plan.steps.map((s) => s.tool)).toEqual([
        "knowledge_search",
        "project_search",
      ]);
      expect(plan.reason).toBe("combined");
    });

    it("drops hallucinated tool names", async () => {
      const llm = new FakeLlm({
        complete:
          '{"steps":[{"tool":"send_email","input":"x"},{"tool":"knowledge_search","input":"y"}],"reason":"mixed"}',
      });

      const plan = await new Planner(llm, makeRegistry(ALL_TOOLS)).plan(
        intent("other"),
      );

      expect(plan.steps.map((s) => s.tool)).toEqual(["knowledge_search"]);
    });

    it("caps the plan at four steps", async () => {
      const llm = new FakeLlm({
        complete: JSON.stringify({
          steps: ALL_TOOLS.map((tool) => ({ tool, input: "x" })),
          reason: "everything",
        }),
      });

      const plan = await new Planner(llm, makeRegistry(ALL_TOOLS)).plan(
        intent("other"),
      );

      expect(plan.steps.length).toBeLessThanOrEqual(4);
    });

    it("falls back to knowledge_search when every proposed tool is unknown", async () => {
      const llm = new FakeLlm({
        complete: '{"steps":[{"tool":"nonsense","input":"x"}],"reason":"bad"}',
      });

      const plan = await new Planner(llm, makeRegistry(ALL_TOOLS)).plan(
        intent("other"),
      );

      expect(plan.steps).toEqual([
        { tool: "knowledge_search", input: "a question" },
      ]);
    });

    it("falls back when the model call fails", async () => {
      const llm = new FakeLlm({ failOn: "complete" });

      const plan = await new Planner(llm, makeRegistry(ALL_TOOLS)).plan(
        intent("other"),
      );

      expect(plan.steps[0].tool).toBe("knowledge_search");
    });
  });
});
