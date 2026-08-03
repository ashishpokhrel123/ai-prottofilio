import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "../../common/config/app-config.service";
import { errorMessage } from "../../core/errors/domain.errors";
import { LLM_PORT, type LlmMessage, type LlmPort } from "../../core/ports";
import {
  OWNER_NAME,
  SMALLTALK_SYSTEM,
  SYNTHESIS_SYSTEM,
} from "../prompts/system.prompts";
import type { AgentEvent, ToolOutcome } from "./agent.types";

const HISTORY_TURNS = 6;

/** Shown when retrieval found nothing — never invent an answer to fill the gap. */
const NO_CONTEXT_NOTICE =
  "No relevant knowledge-base entries were found for this question.";

/**
 * Shown when the tools reported that the data itself has never been added.
 *
 * Deliberately not part of CONTEXT: these are status lines about the system,
 * not facts about the person, and the model must not paraphrase them into an
 * answer. They are labelled as status precisely so it can relay the limitation
 * without dressing it up as knowledge.
 */
const MISSING_DATA_HEADER =
  "DATA STATUS — the following information has not been added to this " +
  "portfolio yet. Tell the visitor plainly which part is missing, in one or " +
  "two sentences, and invite them to ask about something else. Do not treat " +
  "these lines as facts about the person, and do not apologise more than once:";

/**
 * Which of three different jobs the synthesiser is doing.
 *
 * This was a `grounded: boolean`, which could only express "retrieval worked"
 * and "retrieval didn't". Small talk is neither — no retrieval was attempted,
 * because none was warranted — and collapsing it into the false branch made
 * every greeting arrive as a failed lookup.
 */
export type SynthesisMode =
  /** Tools returned usable context. Answer from it and cite it. */
  | "grounded"
  /** Retrieval ran and came back short. Say so; do not guess. */
  | "no_context"
  /** A greeting, thanks or goodbye. Nothing was looked up and nothing needs to be. */
  | "smalltalk";

export interface SynthesisInput {
  readonly question: string;
  readonly outcomes: readonly ToolOutcome[];
  readonly history: readonly LlmMessage[];
  readonly mode: SynthesisMode;
}

export interface SynthesisResult {
  readonly text: string;
}

/**
 * Pipeline node 4 — turn retrieved context into a grounded, cited answer.
 *
 * Yields token deltas so the transport can stream, and returns the assembled
 * text so the caller can persist it without re-joining the stream.
 */
@Injectable()
export class Synthesizer {
  private readonly logger = new Logger(Synthesizer.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly config: AppConfigService,
  ) {}

  async *synthesize(
    input: SynthesisInput,
    signal?: AbortSignal,
  ): AsyncGenerator<AgentEvent, SynthesisResult> {
    const messages = buildTurns(
      input.history,
      input.question,
      this.buildPrompt(input),
    );

    // The system prompt switches with the mode, not just the user turn. The
    // grounding rules ("cite with [n]", "say you don't have that in your
    // knowledge base") are correct for retrieval and wrong for a greeting, and
    // leaving them in place is what produced apologetic hellos with invented
    // citation markers.
    const system =
      input.mode === "smalltalk" ? SMALLTALK_SYSTEM : SYNTHESIS_SYSTEM;

    let text = "";

    try {
      for await (const delta of this.llm.stream(system, messages, {
        signal,
      })) {
        text += delta;
        yield { type: "token", content: delta };
      }
    } catch (err) {
      if (signal?.aborted) return { text };

      const notice = this.failureNotice(err);
      this.logger.warn(`Synthesis failed: ${errorMessage(err)}`);

      // Only substitute a notice if nothing was streamed — replacing a
      // partial answer would be more confusing than truncating it.
      if (!text) {
        text = notice;
        yield { type: "token", content: notice };
      }
    }

    return { text };
  }

  private buildPrompt(input: SynthesisInput): string {
    // No context block and no citation instruction. There is nothing to ground
    // in and nothing to cite, and saying otherwise is what made the model
    // apologise for having no knowledge-base entry on the word "hello".
    if (input.mode === "smalltalk") {
      return `VISITOR SAID: ${input.question}`;
    }

    const context =
      input.mode === "grounded"
        ? `CONTEXT / TOOL RESULTS:\n${renderContext(input.outcomes)}`
        : this.describeGap(input.outcomes);

    return [
      context,
      "",
      `VISITOR QUESTION: ${input.question}`,
      "",
      `Answer as ${OWNER_NAME}, grounded strictly in the context above. Use [n] citations.`,
    ].join("\n");
  }

  /**
   * Explains an ungrounded answer as specifically as the tools allow.
   *
   * "No experience recorded." and "nothing matched your query" are different
   * failures with different remedies, but both used to produce the same "I
   * don't have that in my knowledge base yet" — which reads as a retrieval
   * problem even when the real cause is an unseeded table, and gives the
   * portfolio owner nothing to act on.
   *
   * Grounding is unaffected: this branch only runs when `grounded` is already
   * false, and the status lines stay outside the CONTEXT block.
   */
  private describeGap(outcomes: readonly ToolOutcome[]): string {
    const missing = outcomes.filter(
      (o) => o.emptyReason === "no_data" || o.emptyReason === "not_configured",
    );

    if (missing.length === 0) return NO_CONTEXT_NOTICE;

    return [
      MISSING_DATA_HEADER,
      ...missing.map((o) => `- ${o.text.trim()}`),
    ].join("\n");
  }

  /**
   * Diagnostics are only exposed outside production. In production a visitor
   * sees a plain apology — a stack trace or model name in the chat window is
   * an information leak.
   */
  private failureNotice(err: unknown): string {
    // A missing API key is a setup problem, not a transient one, and "try
    // again in a moment" is actively misleading advice for it — the next
    // attempt fails identically. Saying so leaks nothing: `/health/ready`
    // already reports this state publicly, and no key or model name appears
    // here.
    if (!this.llm.isConfigured) {
      return (
        "The assistant is not configured yet — the deployment is missing its " +
        "`GEMINI_API_KEY`, so there is no language model to answer with. " +
        "Everything else on this site works; this one capability is switched off."
      );
    }

    if (this.config.isProduction) {
      return "I couldn't generate a response just now. Please try again in a moment.";
    }

    return (
      "I couldn't generate a response — the language model call failed:\n\n" +
      `\`\`\`\n${errorMessage(err)}\n\`\`\`\n\n` +
      '(Detail shown because NODE_ENV is not "production". Check GEMINI_API_KEY and GEMINI_LLM_MODEL.)'
    );
  }
}

/**
 * Assembles the multi-turn request the provider will actually accept.
 *
 * Gemini (and Vertex, and every chat-completions clone of it) enforces two
 * invariants on `contents` that a raw slice of stored history violates:
 *
 *  1. The first turn must be `user`. A window boundary that happens to land on
 *     an assistant reply produced a leading `model` turn and a 400.
 *  2. Turns must alternate. `ChatService` persists the visitor's message
 *     *before* the agent loads memory, so the current question was already the
 *     tail of `history` — appending the synthesis prompt after it sent two
 *     consecutive `user` turns and duplicated the question in the request.
 *
 * Both only bite once a conversation has history, which is why single-turn
 * testing never surfaced them. Normalising here keeps the invariant next to
 * the contract it belongs to, so no caller has to remember it.
 */
function buildTurns(
  history: readonly LlmMessage[],
  question: string,
  prompt: string,
): LlmMessage[] {
  const prior = [...history];

  // Drop the current question: it is re-supplied, with context, as `prompt`.
  const latest = prior.at(-1);
  if (latest?.role === "user" && latest.content.trim() === question.trim()) {
    prior.pop();
  }

  const turns: LlmMessage[] = [];
  for (const turn of prior.slice(-HISTORY_TURNS)) {
    // Never open on a model turn.
    if (turns.length === 0 && turn.role === "model") continue;

    // Collapse same-role runs (a turn whose counterpart failed to persist)
    // rather than dropping them — the content still carries context.
    const previous = turns.at(-1);
    if (previous?.role === turn.role) {
      turns[turns.length - 1] = {
        role: turn.role,
        content: `${previous.content}\n\n${turn.content}`,
      };
      continue;
    }

    turns.push(turn);
  }

  // An unanswered trailing user turn would collide with the prompt below.
  if (turns.at(-1)?.role === "user") turns.pop();

  return [...turns, { role: "user", content: prompt }];
}

function renderContext(outcomes: readonly ToolOutcome[]): string {
  return (
    outcomes
      // Failed and empty outcomes contribute nothing but noise — and a "not
      // found" status line in the context block invites the model to treat it
      // as a fact about the person.
      .filter((o) => !o.failed && o.text.trim().length > 0)
      .map((o) => `### ${o.tool}\n${o.text}`)
      .join("\n\n")
  );
}
