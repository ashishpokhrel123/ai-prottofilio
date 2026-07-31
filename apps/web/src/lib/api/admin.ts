import { apiRequest } from "./client";

/**
 * Typed admin endpoints.
 *
 * One module owns every admin route, so a backend contract change surfaces
 * here as a compile error rather than as a runtime `undefined` in a component.
 */

export interface LoginResponse {
  accessToken: string;
  expiresIn: string;
  user: { id: string; email: string; name: string; role: string };
}

export type DocumentStatus = "PENDING" | "PROCESSING" | "INDEXED" | "FAILED";

export interface DocumentRow {
  id: string;
  title: string;
  docType: string;
  source: string;
  status: DocumentStatus;
  tags: string[];
  createdAt: string;
  _count?: { chunks: number };
}

export interface AnalyticsSummary {
  visitors: number;
  questions: number;
  resumeDownloads: number;
  conversations: number;
  avgChatLength: number;
  topKeywords: { term: string; count: number }[];
}

export interface SkillExtractionResult {
  source: "github" | "resume";
  created: number;
  updated: number;
  note?: string;
}

export const adminApi = {
  login: (email: string, password: string) =>
    apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  me: (token: string) =>
    apiRequest<{ sub: string; email: string; role: string }>("/auth/me", {
      token,
    }),

  listDocuments: (token: string) =>
    apiRequest<DocumentRow[]>("/documents", { token }),

  uploadDocument: (token: string, form: FormData) =>
    apiRequest<{ id: string; status: DocumentStatus }>("/documents/upload", {
      method: "POST",
      body: form,
      token,
    }),

  reindexDocument: (token: string, id: string) =>
    apiRequest<{ id: string; status: DocumentStatus }>(
      `/documents/${id}/reindex`,
      { method: "POST", token },
    ),

  deleteDocument: (token: string, id: string) =>
    apiRequest<{ id: string; deleted: boolean }>(`/documents/${id}`, {
      method: "DELETE",
      token,
    }),

  analytics: (token: string) =>
    apiRequest<AnalyticsSummary>("/analytics", { token }),

  syncGithub: (token: string) =>
    apiRequest<{ indexed: number; skipped: number; failed: string[] }>(
      "/github/sync",
      { method: "POST", token },
    ),

  reindexAll: (token: string) =>
    apiRequest<{
      queued: number;
      skipped: number;
      skippedTitles: string[];
    }>("/embeddings/index", { method: "POST", body: {}, token }),

  extractSkills: (token: string) =>
    apiRequest<{ results: SkillExtractionResult[] }>("/skills/extract", {
      method: "POST",
      body: { sources: ["github", "resume"] },
      token,
    }),
} as const;
