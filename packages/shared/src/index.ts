import { z } from "zod";

/** Shared contracts used by both `web` and `api`. Single source of truth. */

export const DocumentType = {
  RESUME: "RESUME",
  PROJECT: "PROJECT",
  CERTIFICATE: "CERTIFICATE",
  BLOG: "BLOG",
  EXPERIENCE: "EXPERIENCE",
  EDUCATION: "EDUCATION",
  SKILL: "SKILL",
  README: "README",
  OTHER: "OTHER",
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const SourceType = {
  GITHUB: "GITHUB",
  WEBSITE: "WEBSITE",
  LINKEDIN: "LINKEDIN",
  MANUAL_UPLOAD: "MANUAL_UPLOAD",
} as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

export const ChatRole = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
  TOOL: "tool",
} as const;
export type ChatRole = (typeof ChatRole)[keyof typeof ChatRole];

export const citationSchema = z.object({
  index: z.number(),
  chunkId: z.string(),
  documentId: z.string(),
  title: z.string(),
  source: z.string(),
  snippet: z.string(),
  score: z.number(),
});
export type Citation = z.infer<typeof citationSchema>;

/**
 * Structured payloads a tool may attach to its `tool_end` chunk so the UI can
 * render a card instead of re-parsing the prose the model was given.
 *
 * Deliberately narrower than the database rows behind them: only fields the UI
 * displays travel over the wire, so widening a Prisma model can't quietly leak
 * a column into the browser.
 */
export const projectCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  summary: z.string(),
  technologies: z.array(z.string()),
  githubUrl: z.string().nullable().optional(),
  liveUrl: z.string().nullable().optional(),
  featured: z.boolean().optional(),
});
export type ProjectCard = z.infer<typeof projectCardSchema>;

export const projectCardsSchema = z.array(projectCardSchema);

export const skillCardSchema = z.object({
  name: z.string(),
  level: z.number(),
});
export type SkillCard = z.infer<typeof skillCardSchema>;

/** Category name → skills, mirroring what `skills_tool` returns. */
export const skillGroupsSchema = z.record(z.string(), z.array(skillCardSchema));
export type SkillGroups = z.infer<typeof skillGroupsSchema>;

/** Tool names whose structured output the UI knows how to render. */
export const CARD_TOOLS = {
  PROJECT_SEARCH: "project_search",
  SKILLS: "skills_tool",
} as const;

/**
 * Pipeline telemetry — what the agent actually did, as it does it.
 *
 * Every field here is measured, never estimated. The UI renders this as a live
 * trace, so a plausible-looking invented number would be worse than an absent
 * one: it would misrepresent the system to the people the portfolio is meant to
 * convince. Anything the API cannot measure is left `undefined` and the UI
 * omits the row rather than filling it in.
 */
export const TRACE_STAGES = [
  "detect",
  "plan",
  "retrieve",
  "rerank",
  "tool",
  "synthesize",
] as const;
export type TraceStageName = (typeof TRACE_STAGES)[number];

export const traceStageSchema = z.object({
  stage: z.enum(TRACE_STAGES),
  /** Wall-clock duration of this stage. Absent while it is still running. */
  ms: z.number().optional(),
  /** One-line human summary, e.g. "hybrid search" or the resolved intent. */
  label: z.string().optional(),
  /**
   * Measured counters. Deliberately open-ended so a stage can report what it
   * knows without every stage carrying every key.
   */
  detail: z
    .object({
      /** Embedding width actually returned by the provider. */
      dimensions: z.number().optional(),
      /** Candidates the vector/hybrid search returned. */
      candidates: z.number().optional(),
      /** Candidates surviving the re-rank. */
      kept: z.number().optional(),
      /** `lexical` or the cross-encoder model id. */
      strategy: z.string().optional(),
      /** Best cosine similarity in the candidate set, 0..1. */
      topSimilarity: z.number().optional(),
      /** The floor `topSimilarity` was compared against. */
      threshold: z.number().optional(),
      /** Whether the confidence gate opened. */
      grounded: z.boolean().optional(),
      /** Tool names this stage ran. */
      tools: z.array(z.string()).optional(),
    })
    .optional(),
});
export type TraceStage = z.infer<typeof traceStageSchema>;

export interface ChatStreamChunk {
  type:
    | "token"
    | "tool_start"
    | "tool_end"
    | "citations"
    | "trace"
    | "done"
    | "error";
  content?: string;
  tool?: string;
  citations?: Citation[];
  conversationId?: string;
  messageId?: string;
  /** Present only on `trace`. */
  trace?: TraceStage;
  /**
   * Structured result of a finished tool, present only on `tool_end` and only
   * for tools in `CARD_TOOLS`. Typed `unknown` because the transport cannot
   * guarantee its shape — consumers validate with the schemas above.
   */
  data?: unknown;
}

export interface JobFitResult {
  score: number; // 0..100
  matchedSkills: string[];
  missingSkills: string[];
  strongProjects: { name: string; reason: string }[];
  summary: string;
}
