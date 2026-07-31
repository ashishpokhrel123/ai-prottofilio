import type { Citation } from "@ai-portfolio/shared";

export interface ToolContext {
  /** The pronoun-resolved question, for tools that need the full query. */
  readonly query: string;
  readonly conversationId: string;
}

/**
 * Why a tool produced nothing.
 *
 * "Found nothing" is not one situation, and the difference is what the visitor
 * needs to hear. An empty table means the portfolio owner hasn't added that
 * information; a query that matched nothing means it exists but isn't relevant.
 * Collapsing the two produced the same "I don't have that in my knowledge base
 * yet" for both, which is misleading in the first case and undiagnosable for
 * the owner.
 */
export type EmptyReason =
  /** The underlying store holds no records at all — the data was never added. */
  | "no_data"
  /** Records exist; none matched this particular query. */
  | "no_match"
  /** A prerequisite isn't set up (GitHub unsynced, no API key). */
  | "not_configured";

export interface ToolOutput {
  readonly ok: boolean;
  /** Text folded into the synthesis prompt. Empty means "nothing to add". */
  readonly text: string;
  /** Structured payload for deterministic consumers (e.g. the job-fit score). */
  readonly data?: unknown;
  readonly citations?: readonly Citation[];
  /** Set only when `ok` is false. Absent on success. */
  readonly emptyReason?: EmptyReason;
}

/**
 * Every agent capability implements this.
 *
 * Adding a capability means writing a class and registering it — the planner,
 * executor and orchestrator never change (Open/Closed). `run` must resolve
 * rather than throw wherever a degraded answer is possible; the executor
 * treats a rejection as a skipped tool.
 */
export interface Tool {
  readonly name: string;
  /** Shown to the planner LLM. Precise wording here measurably improves plans. */
  readonly description: string;
  run(input: string, ctx: ToolContext): Promise<ToolOutput>;
}

/**
 * Standard "nothing found" response, so tools stay consistent.
 *
 * `kind` defaults to `"no_match"` — the conservative choice. Claiming data is
 * missing when it merely didn't match would have the assistant tell a
 * recruiter the portfolio is empty, so a tool must opt in to `"no_data"`.
 */
export function emptyOutput(
  reason: string,
  kind: EmptyReason = "no_match",
): ToolOutput {
  return { ok: false, text: reason, emptyReason: kind };
}
