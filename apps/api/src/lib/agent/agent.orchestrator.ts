import { Injectable, Logger } from "@nestjs/common";
import type { Citation } from "@ai-portfolio/shared";
import { errorDetail } from "../../core/errors/domain.errors";
import { MemoryService } from "../memory/memory.service";
import { IntentDetector } from "./intent.detector";
import { Planner } from "./planner";
import { Synthesizer } from "./synthesizer";
import { ToolExecutor } from "./tool.executor";
import type {
  AgentEvent,
  AgentRunOptions,
  AgentState,
  ToolOutcome,
} from "./agent.types";

/** A reflect→re-plan loop is bounded; an unbounded agent loop is a cost incident. */
const MAX_ITERATIONS = 2;

/** Below this, a tool's output is noise rather than usable grounding. */
const MIN_USEFUL_OUTPUT_CHARS = 20;

/**
 * The agent pipeline: detect → plan → act → reflect → synthesize.
 *
 * This class only sequences the nodes and owns the loop budget; each node is a
 * separately injectable, separately testable collaborator. The whole run is an
 * async generator so any transport (SSE, WebSocket, a test harness) can
 * consume the same event stream.
 */
@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger(AgentOrchestrator.name);

  constructor(
    private readonly intentDetector: IntentDetector,
    private readonly planner: Planner,
    private readonly executor: ToolExecutor,
    private readonly synthesizer: Synthesizer,
    private readonly memory: MemoryService,
  ) {}

  async *run(
    question: string,
    conversationId: string,
    options: AgentRunOptions = {},
  ): AsyncGenerator<AgentEvent> {
    const { signal } = options;
    const memory = await this.memory.load(conversationId);

    const state: AgentState = {
      question,
      conversationId,
      toolOutcomes: [],
      citations: [],
      iterations: 0,
    };

    try {
      // ── 1. Detect ──────────────────────────────────────────────────────
      state.intent = await this.intentDetector.detect(
        question,
        memory.history,
        signal,
      );

      // Small talk needs no retrieval; answering it through the RAG pipeline
      // would just cost a vector search to say "hello".
      if (state.intent.intent === "smalltalk" || !state.intent.needsRetrieval) {
        yield* this.finish(state, memory.history, false, signal);
        return;
      }

      // ── 2-4. Plan → Act → Reflect ──────────────────────────────────────
      do {
        state.plan = await this.planner.plan(state.intent, signal);
        this.logger.debug(
          `Plan (${state.plan.reason}): ${state.plan.steps
            .map((s) => s.tool)
            .join(" → ")}`,
        );

        const execution = yield* this.executor.execute(state.plan, {
          query: state.intent.resolvedQuery,
          conversationId,
        });

        state.toolOutcomes.push(...execution.outcomes);
        state.citations.push(...execution.citations);
        state.iterations += 1;
      } while (
        this.shouldReflect(state) &&
        state.iterations < MAX_ITERATIONS &&
        !signal?.aborted
      );

      if (state.citations.length > 0) {
        yield {
          type: "citations",
          citations: dedupeCitations(state.citations),
        };
      }

      // ── 5. Synthesize ──────────────────────────────────────────────────
      yield* this.finish(state, memory.history, this.isGrounded(state), signal);
    } catch (err) {
      this.logger.error(`Agent run failed: ${errorDetail(err)}`);
      yield {
        type: "error",
        content:
          "Something went wrong while reasoning over the knowledge base. Please try again.",
      };
    }
  }

  /** Streams the answer, persists it, and emits the terminal `done` event. */
  private async *finish(
    state: AgentState,
    history: Parameters<Synthesizer["synthesize"]>[0]["history"],
    grounded: boolean,
    signal?: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    const result = yield* this.synthesizer.synthesize(
      {
        question: state.question,
        outcomes: state.toolOutcomes,
        history,
        grounded,
      },
      signal,
    );

    const messageId = await this.memory.append(
      state.conversationId,
      "assistant",
      result.text,
      {
        citations: dedupeCitations(state.citations),
        toolTrace: state.toolOutcomes.map((o) => o.tool),
      },
    );

    yield { type: "done", messageId };
  }

  /**
   * Reflection: a job-fit answer without the résumé in context is worth one
   * more retrieval attempt. Everything else answers with what it has.
   */
  private shouldReflect(state: AgentState): boolean {
    if (state.intent?.intent !== "job_fit") return false;
    return !state.toolOutcomes.some(
      (o) => o.tool === "resume_tool" && o.text.length > 40,
    );
  }

  /**
   * Confidence gate — did any tool return enough to ground an answer?
   *
   * Only successful outcomes count. A tool reporting "no skills recorded"
   * returns a sentence long enough to clear the length threshold, so without
   * the `failed` check an empty knowledge base would read as grounded.
   */
  private isGrounded(state: AgentState): boolean {
    return state.toolOutcomes.some(
      (o: ToolOutcome) =>
        !o.failed && o.text.trim().length > MIN_USEFUL_OUTPUT_CHARS,
    );
  }
}

/**
 * De-duplicates by chunk id and renumbers, so the `[n]` markers the model was
 * given always line up with the citation list the UI renders.
 */
function dedupeCitations(citations: readonly Citation[]): Citation[] {
  const seen = new Set<string>();
  const unique: Citation[] = [];

  for (const citation of citations) {
    if (seen.has(citation.chunkId)) continue;
    seen.add(citation.chunkId);
    unique.push(citation);
  }

  return unique.map((c, i) => ({ ...c, index: i + 1 }));
}
