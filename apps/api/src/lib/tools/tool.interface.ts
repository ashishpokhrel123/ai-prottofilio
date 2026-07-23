import { Citation } from "@ai-portfolio/shared";

export interface ToolContext {
  query: string;
  conversationId?: string;
}

export interface ToolOutput {
  ok: boolean;
  /** Human/LLM-readable text folded into the synthesis context. */
  text: string;
  /** Structured payload for deterministic consumers (e.g. job-fit score). */
  data?: unknown;
  citations?: Citation[];
}

/**
 * Every agent tool implements this. New capabilities are added by creating a
 * class that implements Tool and registering it — no changes to the executor
 * (Open/Closed + Interface Segregation).
 */
export interface Tool {
  readonly name: string;
  readonly description: string;
  run(input: string, ctx: ToolContext): Promise<ToolOutput>;
}
