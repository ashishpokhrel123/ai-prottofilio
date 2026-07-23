import { Citation } from "@ai-portfolio/shared";

export interface Intent {
  intent: string;
  needsRetrieval: boolean;
  entities: string[];
  resolvedQuery: string;
}

export interface PlanStep {
  tool: string;
  input: string;
}

export interface Plan {
  steps: PlanStep[];
  reason: string;
}

export interface AgentState {
  question: string;
  conversationId: string;
  intent?: Intent;
  plan?: Plan;
  toolOutputs: { tool: string; text: string; data?: unknown }[];
  citations: Citation[];
  context: string;
  iterations: number;
}

export type AgentEvent =
  | { type: "tool_start"; tool: string }
  | { type: "tool_end"; tool: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "token"; content: string }
  | { type: "done"; messageId?: string }
  | { type: "error"; content: string };
