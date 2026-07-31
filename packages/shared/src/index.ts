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

export interface ChatStreamChunk {
  type: "token" | "tool_start" | "tool_end" | "citations" | "done" | "error";
  content?: string;
  tool?: string;
  citations?: Citation[];
  conversationId?: string;
  messageId?: string;
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
