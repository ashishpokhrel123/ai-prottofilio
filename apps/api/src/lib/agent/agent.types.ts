import type { Citation, TraceStage } from "@ai-portfolio/shared";
import type { RetrievalStats } from "../retriever/retriever.service";
import type { EmptyReason } from "../tools/tool.interface";

/**
 * The intents the planner recognises.
 *
 * A closed union rather than `string`: adding an intent then forces the
 * compiler to point at every switch that needs a new branch.
 */
export const INTENTS = [
  "smalltalk",
  "about",
  "projects",
  "project_detail",
  "skills",
  "experience",
  "education",
  "certificates",
  "contact",
  "github",
  "job_fit",
  "resume_download",
  "other",
] as const;

export type IntentName = (typeof INTENTS)[number];

export function isIntentName(value: unknown): value is IntentName {
  return (
    typeof value === "string" && (INTENTS as readonly string[]).includes(value)
  );
}

export interface Intent {
  readonly intent: IntentName;
  /** False for greetings and meta questions that need no knowledge base. */
  readonly needsRetrieval: boolean;
  readonly entities: readonly string[];
  /** The question with pronouns resolved against conversation history. */
  readonly resolvedQuery: string;
}

export interface PlanStep {
  readonly tool: string;
  readonly input: string;
}

export interface Plan {
  readonly steps: readonly PlanStep[];
  /** Why the planner chose these steps — surfaced in debug logs. */
  readonly reason: string;
}

export interface ToolOutcome {
  readonly tool: string;
  readonly text: string;
  readonly data?: unknown;
  readonly failed?: boolean;
  /**
   * Why the tool produced nothing, when it did. Distinguishes "the owner never
   * added this data" from "nothing matched", which read identically to a
   * visitor otherwise.
   */
  readonly emptyReason?: EmptyReason;
  /** Measured retrieval telemetry, for tools that ran the vector pipeline. */
  readonly retrieval?: RetrievalStats;
}

/** Accumulated state threaded through the agent pipeline. */
export interface AgentState {
  readonly question: string;
  readonly conversationId: string;
  intent?: Intent;
  plan?: Plan;
  toolOutcomes: ToolOutcome[];
  citations: Citation[];
  iterations: number;
}

export type AgentEvent =
  | { readonly type: "tool_start"; readonly tool: string }
  | {
      readonly type: "tool_end";
      readonly tool: string;
      /**
       * The tool's structured output, forwarded verbatim so a transport can
       * hand the UI a renderable card. Absent when the tool produced only
       * prose or failed.
       */
      readonly data?: unknown;
    }
  | { readonly type: "citations"; readonly citations: readonly Citation[] }
  /**
   * Measured pipeline telemetry, emitted as each stage completes.
   *
   * A separate event rather than a field on `done` so the UI can draw the
   * trace while the answer is still being produced — which is the entire point
   * of showing it. Purely observational: dropping every `trace` event would
   * leave the answer byte-identical.
   */
  | { readonly type: "trace"; readonly trace: TraceStage }
  | { readonly type: "token"; readonly content: string }
  | { readonly type: "done"; readonly messageId?: string }
  | { readonly type: "error"; readonly content: string };

export interface AgentRunOptions {
  /** Cancels in-flight LLM calls when the client disconnects mid-stream. */
  readonly signal?: AbortSignal;
}
