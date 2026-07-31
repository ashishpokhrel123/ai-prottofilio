import { IntentDetector } from "./intent.detector";
import { FakeLlm } from "./test-doubles";

describe("IntentDetector", () => {
  const detect = (llm: FakeLlm, question: string, history = []) =>
    new IntentDetector(llm).detect(question, history);

  describe("greeting short-circuit", () => {
    it.each(["hi", "Hello", "hey!", "thanks", "good morning"])(
      "classifies %j as smalltalk without calling the model",
      async (greeting) => {
        const llm = new FakeLlm();
        const intent = await detect(llm, greeting);

        expect(intent.intent).toBe("smalltalk");
        expect(intent.needsRetrieval).toBe(false);
        // The point of the short-circuit: no model call, no cost, no latency.
        expect(llm.completions).toHaveLength(0);
      },
    );

    it("does not treat a real question as a greeting", async () => {
      const llm = new FakeLlm({
        complete:
          '{"intent":"projects","needsRetrieval":true,"entities":[],"resolvedQuery":"what projects?"}',
      });

      const intent = await detect(llm, "hey, what projects have you built?");

      expect(intent.intent).toBe("projects");
      expect(llm.completions).toHaveLength(1);
    });
  });

  describe("model-driven classification", () => {
    it("uses the model's intent and resolved query", async () => {
      const llm = new FakeLlm({
        complete:
          '{"intent":"project_detail","needsRetrieval":true,"entities":["Immortalis"],"resolvedQuery":"how was the Immortalis project deployed"}',
      });

      const intent = await detect(llm, "how was it deployed?");

      expect(intent.intent).toBe("project_detail");
      expect(intent.resolvedQuery).toBe(
        "how was the Immortalis project deployed",
      );
      expect(intent.entities).toEqual(["Immortalis"]);
    });

    it("maps an unrecognised intent to 'other'", async () => {
      const llm = new FakeLlm({
        complete: '{"intent":"invent_something","needsRetrieval":true}',
      });

      expect((await detect(llm, "a question")).intent).toBe("other");
    });

    it("falls back to the raw question when resolvedQuery is missing", async () => {
      const llm = new FakeLlm({ complete: '{"intent":"skills"}' });

      expect((await detect(llm, "what can you do?")).resolvedQuery).toBe(
        "what can you do?",
      );
    });
  });

  describe("resilience", () => {
    it("falls back to retrieval when the model call fails", async () => {
      const llm = new FakeLlm({ failOn: "complete" });

      const intent = await detect(llm, "tell me about your work");

      // A classifier failure must degrade to generic retrieval, never abort
      // the stream — the visitor still gets an answer.
      expect(intent.intent).toBe("other");
      expect(intent.needsRetrieval).toBe(true);
    });

    it("falls back when the model returns unparseable output", async () => {
      const llm = new FakeLlm({ complete: "I think this is about projects." });

      expect((await detect(llm, "a question")).intent).toBe("other");
    });
  });
});
