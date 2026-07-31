import type { AppConfigService } from "../../common/config/app-config.service";
import { Synthesizer } from "./synthesizer";
import { FakeLlm } from "./test-doubles";
import type { AgentEvent, ToolOutcome } from "./agent.types";

function makeSynthesizer(llm: FakeLlm, isProduction = false) {
  return new Synthesizer(llm, { isProduction } as AppConfigService);
}

async function drain(generator: AsyncGenerator<AgentEvent, { text: string }>) {
  const events: AgentEvent[] = [];
  let next = await generator.next();
  while (!next.done) {
    events.push(next.value);
    next = await generator.next();
  }
  return { events, result: next.value };
}

const GROUNDED_INPUT = {
  question: "What projects have you built?",
  outcomes: [
    { tool: "project_search", text: "Immortalis: a digital legacy platform." },
  ] as ToolOutcome[],
  history: [],
  grounded: true,
};

describe("Synthesizer", () => {
  it("streams token events and returns the assembled text", async () => {
    const llm = new FakeLlm({ stream: ["Immor", "talis", " is..."] });

    const { events, result } = await drain(
      makeSynthesizer(llm).synthesize(GROUNDED_INPUT),
    );

    expect(events.map((e) => (e as { content: string }).content)).toEqual([
      "Immor",
      "talis",
      " is...",
    ]);
    // The caller persists this without having to re-join the stream.
    expect(result.text).toBe("Immortalis is...");
  });

  describe("prompt construction", () => {
    it("includes tool output when grounded", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });

      await drain(makeSynthesizer(llm).synthesize(GROUNDED_INPUT));

      const prompt = llm.streams[0].messages.at(-1)?.content ?? "";
      expect(prompt).toContain("CONTEXT / TOOL RESULTS");
      expect(prompt).toContain("Immortalis: a digital legacy platform.");
      expect(prompt).toContain("What projects have you built?");
    });

    it("states plainly that nothing was found when ungrounded", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });

      await drain(
        makeSynthesizer(llm).synthesize({
          ...GROUNDED_INPUT,
          grounded: false,
        }),
      );

      const prompt = llm.streams[0].messages.at(-1)?.content ?? "";
      expect(prompt).toContain("No relevant knowledge-base entries");
      expect(prompt).not.toContain("CONTEXT / TOOL RESULTS");
    });

    /**
     * Regression: an empty `Experience` table produced "I don't have that in
     * my knowledge base yet", which reads as a retrieval failure. The real
     * cause — the data was never seeded — was discarded with the outcome, so
     * neither the visitor nor the portfolio owner could tell the difference.
     */
    it("names the missing data when a tool reports an empty store", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });

      await drain(
        makeSynthesizer(llm).synthesize({
          ...GROUNDED_INPUT,
          grounded: false,
          outcomes: [
            {
              tool: "experience_tool",
              text: "No experience recorded.",
              failed: true,
              emptyReason: "no_data",
            },
          ],
        }),
      );

      const prompt = llm.streams[0].messages.at(-1)?.content ?? "";
      expect(prompt).toContain("DATA STATUS");
      expect(prompt).toContain("No experience recorded.");
      // Still not knowledge: the status line must stay out of the context
      // block, or the model will paraphrase it as a fact about the person.
      expect(prompt).not.toContain("CONTEXT / TOOL RESULTS");
      expect(prompt).not.toContain("No relevant knowledge-base entries");
    });

    it("names an unconfigured prerequisite the same way", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });

      await drain(
        makeSynthesizer(llm).synthesize({
          ...GROUNDED_INPUT,
          grounded: false,
          outcomes: [
            {
              tool: "github_tool",
              text: "GitHub has not been synced yet.",
              failed: true,
              emptyReason: "not_configured",
            },
          ],
        }),
      );

      const prompt = llm.streams[0].messages.at(-1)?.content ?? "";
      expect(prompt).toContain("DATA STATUS");
      expect(prompt).toContain("GitHub has not been synced yet.");
    });

    /**
     * A query that matched nothing is not missing data — claiming otherwise
     * would tell a recruiter the portfolio is empty when it is merely
     * irrelevant to what they asked.
     */
    it("falls back to the generic notice when nothing merely matched", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });

      await drain(
        makeSynthesizer(llm).synthesize({
          ...GROUNDED_INPUT,
          grounded: false,
          outcomes: [
            {
              tool: "knowledge_search",
              text: "No confident matches found in the knowledge base.",
              failed: true,
              emptyReason: "no_match",
            },
          ],
        }),
      );

      const prompt = llm.streams[0].messages.at(-1)?.content ?? "";
      expect(prompt).toContain("No relevant knowledge-base entries");
      expect(prompt).not.toContain("DATA STATUS");
    });

    it("reports every missing store when several tools came up empty", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });

      await drain(
        makeSynthesizer(llm).synthesize({
          ...GROUNDED_INPUT,
          grounded: false,
          outcomes: [
            {
              tool: "experience_tool",
              text: "No experience recorded.",
              failed: true,
              emptyReason: "no_data",
            },
            {
              tool: "skills_tool",
              text: "No skills recorded.",
              failed: true,
              emptyReason: "no_data",
            },
            {
              tool: "knowledge_search",
              text: "No confident matches found in the knowledge base.",
              failed: true,
              emptyReason: "no_match",
            },
          ],
        }),
      );

      const prompt = llm.streams[0].messages.at(-1)?.content ?? "";
      expect(prompt).toContain("No experience recorded.");
      expect(prompt).toContain("No skills recorded.");
      // The no_match line is not a missing-data claim and must not be listed.
      expect(prompt).not.toContain("No confident matches");
    });

    /**
     * Regression: a "not found" status line used to be rendered into the
     * context block, inviting the model to treat it as a fact about the person.
     */
    it("excludes failed tool outcomes from the context", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });

      await drain(
        makeSynthesizer(llm).synthesize({
          ...GROUNDED_INPUT,
          outcomes: [
            { tool: "project_search", text: "Real project content." },
            {
              tool: "github_tool",
              text: "GitHub has not been synced yet.",
              failed: true,
            },
          ],
        }),
      );

      const prompt = llm.streams[0].messages.at(-1)?.content ?? "";
      expect(prompt).toContain("Real project content.");
      expect(prompt).not.toContain("GitHub has not been synced yet.");
    });

    it("trims history to the recent window", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });
      // 20 alternating turns; only the last 6 should survive.
      const history = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? ("user" as const) : ("model" as const),
        content: `turn ${i}`,
      }));

      await drain(
        makeSynthesizer(llm).synthesize({ ...GROUNDED_INPUT, history }),
      );

      // 6 history turns plus the current question.
      const { messages } = llm.streams[0];
      expect(messages).toHaveLength(7);
      expect(messages[0].content).toBe("turn 14");
    });
  });

  /**
   * Regression: history was spliced straight into the request. Gemini rejects
   * `contents` that open on a `model` turn or repeat a role, so multi-turn
   * chat 400'd as soon as a conversation had history — invisible to
   * single-turn tests and to any fake that ignores the sequence.
   */
  describe("provider turn invariants", () => {
    const assertValid = (messages: readonly { role: string }[]) => {
      expect(messages[0].role).toBe("user");
      expect(messages.at(-1)?.role).toBe("user");
      messages.forEach((m, i) => {
        if (i > 0) expect(m.role).not.toBe(messages[i - 1].role);
      });
    };

    it("never opens the request on a model turn", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });

      await drain(
        makeSynthesizer(llm).synthesize({
          ...GROUNDED_INPUT,
          history: [
            { role: "model", content: "an answer whose question fell out" },
            { role: "user", content: "a follow-up" },
            { role: "model", content: "its answer" },
          ],
        }),
      );

      assertValid(llm.streams[0].messages);
    });

    /**
     * `ChatService` persists the visitor's message before the agent loads
     * memory, so the current question is already the tail of `history`.
     */
    it("does not repeat the current question as its own turn", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });

      await drain(
        makeSynthesizer(llm).synthesize({
          ...GROUNDED_INPUT,
          history: [
            { role: "user", content: "earlier question" },
            { role: "model", content: "earlier answer" },
            { role: "user", content: GROUNDED_INPUT.question },
          ],
        }),
      );

      const { messages } = llm.streams[0];
      assertValid(messages);
      expect(messages).toHaveLength(3);
      // Present once, inside the synthesis prompt — not as a bare turn.
      expect(
        messages.filter((m) => m.content === GROUNDED_INPUT.question),
      ).toHaveLength(0);
      expect(messages.at(-1)?.content).toContain(GROUNDED_INPUT.question);
    });

    it("collapses a same-role run rather than sending it verbatim", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });

      await drain(
        makeSynthesizer(llm).synthesize({
          ...GROUNDED_INPUT,
          history: [
            { role: "user", content: "first" },
            { role: "user", content: "second" },
            { role: "model", content: "one answer for both" },
          ],
        }),
      );

      const { messages } = llm.streams[0];
      assertValid(messages);
      expect(messages[0].content).toBe("first\n\nsecond");
    });

    it("leaves a single-turn request untouched", async () => {
      const llm = new FakeLlm({ stream: ["ok"] });

      await drain(makeSynthesizer(llm).synthesize(GROUNDED_INPUT));

      expect(llm.streams[0].messages).toHaveLength(1);
      assertValid(llm.streams[0].messages);
    });
  });

  describe("model failure", () => {
    it("emits a diagnostic notice outside production", async () => {
      const llm = new FakeLlm({ failOn: "stream" });

      const { result } = await drain(
        makeSynthesizer(llm, false).synthesize(GROUNDED_INPUT),
      );

      expect(result.text).toContain("simulated stream failure");
    });

    it("hides the cause in production", async () => {
      const llm = new FakeLlm({ failOn: "stream" });

      const { result } = await drain(
        makeSynthesizer(llm, true).synthesize(GROUNDED_INPUT),
      );

      // A stack trace or model name in the chat window is an information leak.
      expect(result.text).not.toContain("simulated stream failure");
      expect(result.text).toContain("try again");
    });

    it("does not throw — the stream must still terminate cleanly", async () => {
      const llm = new FakeLlm({ failOn: "stream" });

      await expect(
        drain(makeSynthesizer(llm).synthesize(GROUNDED_INPUT)),
      ).resolves.toBeDefined();
    });
  });
});
