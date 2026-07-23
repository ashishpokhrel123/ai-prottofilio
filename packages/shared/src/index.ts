import { z } from 'zod';

/** Shared contracts used by both `web` and `api`. Single source of truth. */

export const DocumentType = {
  RESUME: 'RESUME',
  PROJECT: 'PROJECT',
  CERTIFICATE: 'CERTIFICATE',
  BLOG: 'BLOG',
  EXPERIENCE: 'EXPERIENCE',
  EDUCATION: 'EDUCATION',
  SKILL: 'SKILL',
  README: 'README',
  OTHER: 'OTHER',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const SourceType = {
  GITHUB: 'GITHUB',
  WEBSITE: 'WEBSITE',
  LINKEDIN: 'LINKEDIN',
  MANUAL_UPLOAD: 'MANUAL_UPLOAD',
} as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

export const ChatRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool',
} as const;
export type ChatRole = (typeof ChatRole)[keyof typeof ChatRole];

export const chatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  stream: z.boolean().default(true),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

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

export interface ChatStreamChunk {
  type: 'token' | 'tool_start' | 'tool_end' | 'citations' | 'done' | 'error';
  content?: string;
  tool?: string;
  citations?: Citation[];
  conversationId?: string;
  messageId?: string;
}

export interface AgentToolResult {
  tool: string;
  ok: boolean;
  data: unknown;
  citations?: Citation[];
}

export interface JobFitResult {
  score: number; // 0..100
  matchedSkills: string[];
  missingSkills: string[];
  strongProjects: { name: string; reason: string }[];
  summary: string;
}
