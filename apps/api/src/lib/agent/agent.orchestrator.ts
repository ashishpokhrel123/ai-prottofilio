import { Injectable, Logger } from "@nestjs/common";
import { GeminiService } from "../llm/gemini.service";
import { ToolRegistry } from "../tools/tool.registry";
import { MemoryService } from "../memory/memory.service";
import {
  INTENT_SYSTEM,
  PLANNER_SYSTEM,
  SYNTHESIS_SYSTEM,
} from "../prompts/system.prompts";
import { AgentEvent, AgentState, Intent, Plan } from "./agent.types";

/**
 * Custom LangGraph-style agent. State flows through nodes:
 *   detect → plan → act → reflect → synthesize
 * Nodes may loop (reflect → plan) up to MAX_ITERATIONS. The whole run is an
 * async generator so the transport layer can stream events to the client.
 */
@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger(AgentOrchestrator.name);
  private readonly MAX_ITERATIONS = 2;

  constructor(
    private readonly gemini: GeminiService,
    private readonly tools: ToolRegistry,
    private readonly memory: MemoryService,
  ) {}

  async *run(
    question: string,
    conversationId: string,
  ): AsyncGenerator<AgentEvent> {
    const mem = await this.memory.load(conversationId);
    const state: AgentState = {
      question,
      conversationId,
      toolOutputs: [],
      citations: [],
      context: "",
      iterations: 0,
    };

    try {
      // 1) DETECT
      state.intent = await this.detect(question, mem.history);

      // Small talk / meta → answer directly without retrieval.
      if (state.intent.intent === "smalltalk" || !state.intent.needsRetrieval) {
        yield* this.synthesize(state, mem.history, /*grounded*/ false);
        return;
      }

      // 2..4) PLAN → ACT → REFLECT (loop)
      do {
        state.plan = await this.plan(state.intent);
        for (const step of state.plan.steps) {
          const tool = this.tools.get(step.tool);
          if (!tool) continue;
          yield { type: "tool_start", tool: step.tool };
          // A single failing tool (e.g. vector DB or embeddings unavailable)
          // must not abort the whole answer. Skip it and keep going so the
          // agent can still synthesize from whatever else succeeded.
          try {
            const out = await tool.run(
              step.input || state.intent.resolvedQuery,
              {
                query: state.intent.resolvedQuery,
                conversationId,
              },
            );
            if (out.citations?.length) {
              state.citations.push(...out.citations);
            }
            state.toolOutputs.push({
              tool: step.tool,
              text: out.text,
              data: out.data,
            });
          } catch (err) {
            this.logger.warn(
              `tool "${step.tool}" failed, continuing without it: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            state.toolOutputs.push({ tool: step.tool, text: "" });
          }
          yield { type: "tool_end", tool: step.tool };
        }
        state.iterations += 1;
      } while (this.needMore(state) && state.iterations < this.MAX_ITERATIONS);

      // Confidence gate — nothing useful retrieved.
      const anyUseful = state.toolOutputs.some(
        (o) => o.text && o.text.length > 20,
      );
      state.context = state.toolOutputs
        .map((o) => `### ${o.tool}\n${o.text}`)
        .join("\n\n");

      if (state.citations.length) {
        yield {
          type: "citations",
          citations: dedupeCitations(state.citations),
        };
      }

      // 5) SYNTHESIZE
      yield* this.synthesize(state, mem.history, /*grounded*/ anyUseful);
    } catch (err) {
      this.logger.error(err instanceof Error ? err.stack : String(err));
      yield {
        type: "error",
        content:
          "Something went wrong while reasoning over the knowledge base.",
      };
    }
  }

  // ---------- nodes ----------

  private async detect(
    question: string,
    history: { role: string; content: string }[],
  ): Promise<Intent> {
    const memText = history
      .slice(-4)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    try {
      const raw = await this.gemini.complete(INTENT_SYSTEM, [
        {
          role: "user",
          content: `Conversation so far:\n${memText}\n\nNew question: ${question}`,
        },
      ]);
      return this.parseJson<Intent>(raw, {
        intent: "other",
        needsRetrieval: true,
        entities: [],
        resolvedQuery: question,
      });
    } catch {
      return {
        intent: "other",
        needsRetrieval: true,
        entities: [],
        resolvedQuery: question,
      };
    }
  }

  private async plan(intent: Intent): Promise<Plan> {
    // Deterministic fast-paths for well-known intents keep latency/cost down.
    const fast = this.fastPlan(intent);
    if (fast) return fast;
    try {
      const raw = await this.gemini.complete(PLANNER_SYSTEM, [
        {
          role: "user",
          content: `Intent: ${intent.intent}\nQuestion: ${intent.resolvedQuery}\nTools:\n${this.tools.catalogue()}`,
        },
      ]);
      return this.parseJson<Plan>(raw, {
        steps: [{ tool: "knowledge_search", input: intent.resolvedQuery }],
        reason: "fallback",
      });
    } catch {
      return {
        steps: [{ tool: "knowledge_search", input: intent.resolvedQuery }],
        reason: "fallback",
      };
    }
  }

  private fastPlan(intent: Intent): Plan | null {
    const q = intent.resolvedQuery;
    switch (intent.intent) {
      case "job_fit":
        return {
          reason: "job fit chain",
          steps: [
            { tool: "job_description_analyzer", input: q },
            { tool: "resume_tool", input: q },
            { tool: "skills_tool", input: q },
            { tool: "project_search", input: q },
          ],
        };
      case "projects":
      case "project_detail":
        return {
          reason: "project lookup",
          steps: [
            { tool: "project_search", input: q },
            { tool: "knowledge_search", input: q },
          ],
        };
      case "skills":
        return { reason: "skills", steps: [{ tool: "skills_tool", input: q }] };
      case "experience":
        return {
          reason: "experience",
          steps: [{ tool: "experience_tool", input: q }],
        };
      case "contact":
        return {
          reason: "contact",
          steps: [{ tool: "contact_tool", input: q }],
        };
      case "github":
        return { reason: "github", steps: [{ tool: "github_tool", input: q }] };
      case "about":
        return {
          reason: "about",
          steps: [
            { tool: "resume_tool", input: q },
            { tool: "knowledge_search", input: q },
          ],
        };
      default:
        return null;
    }
  }

  private needMore(state: AgentState): boolean {
    // Reflect: if job_fit but no resume text retrieved, loop once more.
    if (state.intent?.intent === "job_fit") {
      const hasResume = state.toolOutputs.some(
        (o) => o.tool === "resume_tool" && o.text.length > 40,
      );
      return !hasResume && state.iterations < this.MAX_ITERATIONS;
    }
    return false;
  }

  private async *synthesize(
    state: AgentState,
    history: { role: "user" | "model"; content: string }[],
    grounded: boolean,
  ): AsyncGenerator<AgentEvent> {
    const contextBlock = grounded
      ? `CONTEXT / TOOL RESULTS:\n${state.context}`
      : `No relevant knowledge-base entries were found for this question.`;

    const messages = [
      ...history.slice(-6),
      {
        role: "user" as const,
        content: `${contextBlock}\n\nVISITOR QUESTION: ${state.question}\n\nAnswer as ${"Ashish Pokhrel"}, grounded strictly in the context above. Use [n] citations.`,
      },
    ];

    let full = "";
    try {
      for await (const delta of this.gemini.stream(SYNTHESIS_SYSTEM, messages)) {
        full += delta;
        yield { type: "token", content: delta };
      }
    } catch (err) {
      // Don't let an LLM/streaming fault bubble up as the generic
      // "something went wrong" error — emit a readable message instead.
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`synthesis stream failed: ${detail}`);
      if (!full) {
        const isDev =
          (process.env.NODE_ENV ?? "development") !== "production";
        const notice = isDev
          ? `I couldn't generate a response — the Gemini call failed:\n\n` +
            `\`\`\`\n${detail}\n\`\`\`\n\n` +
            `(Shown because NODE_ENV is not "production". Common fixes: use a valid GEMINI_LLM_MODEL, ` +
            `or check the API key/permissions.)`
          : "I couldn't generate a response just now — the language model isn't reachable. " +
            "Please check the GEMINI_API_KEY in .env and try again.";
        full = notice;
        yield { type: "token", content: notice };
      }
    }

    const messageId = await this.memory.append(
      state.conversationId,
      "assistant",
      full,
      {
        citations: dedupeCitations(state.citations),
        toolTrace: state.toolOutputs.map((o) => o.tool),
      },
    );
    yield { type: "done", messageId };
  }

  private parseJson<T>(raw: string, fallback: T): T {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      return match ? (JSON.parse(match[0]) as T) : fallback;
    } catch {
      return fallback;
    }
  }
}

function dedupeCitations<T extends { chunkId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of items) {
    if (seen.has(c.chunkId)) continue;
    seen.add(c.chunkId);
    out.push(c);
  }
  return out.map((c, i) => ({ ...c, index: i + 1 }));
}
