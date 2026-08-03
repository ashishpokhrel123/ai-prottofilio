import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { errorMessage } from "../../core/errors/domain.errors";
import { LLM_PORT, type LlmMessage, type LlmPort } from "../../core/ports";
import { INTENT_SYSTEM } from "../prompts/system.prompts";
import { parseJsonResponse } from "./parse-json";
import { INTENTS, type Intent, type IntentName } from "./agent.types";

const HISTORY_TURNS = 4;

const intentResponseSchema = z.object({
  intent: z.string(),
  needsRetrieval: z.boolean().default(true),
  entities: z.array(z.string()).default([]),
  resolvedQuery: z.string().min(1).optional(),
});

/**
 * Pipeline node 1 — classify the question and resolve pronouns against recent
 * conversation history ("how was *it* deployed?" → "...the Immortalis project").
 *
 * Every failure path returns a usable intent rather than throwing: a
 * misclassified question still gets answered via generic retrieval, whereas a
 * thrown error would kill the stream.
 */
@Injectable()
export class IntentDetector {
  private readonly logger = new Logger(IntentDetector.name);

  constructor(@Inject(LLM_PORT) private readonly llm: LlmPort) {}

  async detect(
    question: string,
    history: readonly LlmMessage[],
    signal?: AbortSignal,
  ): Promise<Intent> {
    const fallback = this.fallbackIntent(question);

    // Cheap deterministic short-circuit — no need to spend a model call
    // deciding that "hi" is small talk.
    const greeting = this.detectGreeting(question);
    if (greeting) return greeting;

    try {
      const recent = history
        .slice(-HISTORY_TURNS)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const raw = await this.llm.complete(
        INTENT_SYSTEM,
        [
          {
            role: "user",
            content: `Conversation so far:\n${recent || "(none)"}\n\nNew question: ${question}`,
          },
        ],
        { signal, temperature: 0 },
      );

      const parsed = parseJsonResponse(raw, intentResponseSchema, {
        intent: fallback.intent,
        needsRetrieval: true,
        entities: [],
        resolvedQuery: question,
      });

      return {
        intent: this.normalizeIntent(parsed.intent),
        needsRetrieval: parsed.needsRetrieval,
        entities: parsed.entities,
        resolvedQuery: parsed.resolvedQuery?.trim() || question,
      };
    } catch (err) {
      this.logger.warn(
        `Intent detection failed, defaulting to retrieval: ${errorMessage(err)}`,
      );
      return fallback;
    }
  }

  private normalizeIntent(value: string): IntentName {
    const normalized = value.trim().toLowerCase();
    return (INTENTS as readonly string[]).includes(normalized)
      ? (normalized as IntentName)
      : "other";
  }

  /**
   * Matches a message that is *only* a pleasantry.
   *
   * The anchors are the whole point. "hi" is small talk; "hi, what have you
   * built?" is a projects question wearing a greeting, and treating it as
   * small talk would silently drop the real query — a worse failure than the
   * one this is fixing. So the pattern has to consume the entire message.
   *
   * The previous version was an exact-match `Set`, which meant "hello" was
   * handled but "hi there", "hey Ashish" and "hello!!" all fell through to a
   * full vector search over the portfolio.
   */
  private static readonly GREETING =
    /^(hi+|hey+|hello+|holla|hola|yo|hiya|howdy|sup|greetings|good\s+(morning|afternoon|evening|day))$/;

  private static readonly COURTESY =
    /^(thanks?|thank\s+you|thx|ty|cheers|nice|cool|awesome|great|ok(ay)?|got\s+it|bye|goodbye|see\s+ya|later|good\s?night)$/;

  private detectGreeting(question: string): Intent | null {
    const normalized = question
      .trim()
      .toLowerCase()
      // Trailing punctuation and emoji carry no intent. Stripped from both
      // ends so "…hello!!" and "hey :)" still match.
      .replace(/[!.?,~]+/g, " ")
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) return null;

    // Drop a trailing vocative or filler so "hey there" and "hi Ashish" reduce
    // to the bare greeting. Anything longer than this is a real message.
    const core = normalized
      .replace(/\s+(there|all|team|again|ashish|mate|folks)$/, "")
      .trim();

    const isSmallTalk =
      IntentDetector.GREETING.test(core) || IntentDetector.COURTESY.test(core);

    if (!isSmallTalk) return null;

    return {
      intent: "smalltalk",
      needsRetrieval: false,
      entities: [],
      resolvedQuery: question,
    };
  }

  private fallbackIntent(question: string): Intent {
    return {
      intent: "other",
      needsRetrieval: true,
      entities: [],
      resolvedQuery: question,
    };
  }
}
