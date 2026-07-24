import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface LlmMessage {
  role: "user" | "model";
  content: string;
}

/**
 * Thin wrapper around Google Gemini for both generation and embeddings.
 * Kept behind this service so the rest of the app depends on an interface,
 * not on the vendor SDK (Dependency Inversion).
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly client: GoogleGenerativeAI;
  private readonly embedModelName: string;
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("gemini.apiKey") ?? "";
    // The .env ships with a placeholder; treat that (and empty) as unset so
    // callers can degrade gracefully instead of throwing an opaque auth error.
    this.configured = apiKey.length > 0 && apiKey !== "your-gemini-api-key";
    if (!this.configured) {
      this.logger.warn(
        "GEMINI_API_KEY is not set (or still the placeholder). " +
          "The assistant will return a setup message until a real key is provided in .env.",
      );
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.embedModelName =
      this.config.get<string>("gemini.embeddingModel") ?? "text-embedding-004";
  }

  /** Whether a usable Gemini API key is configured. */
  isConfigured(): boolean {
    return this.configured;
  }

  /** Single, non-streaming completion. */
  async complete(system: string, messages: LlmMessage[]): Promise<string> {
    // Callers (intent/plan) already have deterministic fallbacks for "".
    if (!this.configured) return "";
    const model = this.client.getGenerativeModel({
      model: this.config.get<string>("gemini.llmModel") ?? "gemini-2.5-pro",
      systemInstruction: system,
    });
    const res = await model.generateContent({
      contents: messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      })),
    });
    return res.response.text();
  }

  /** Streaming completion — yields text deltas. */
  async *stream(
    system: string,
    messages: LlmMessage[],
  ): AsyncGenerator<string> {
    if (!this.configured) {
      yield "⚠️ The assistant isn't fully configured yet: no Gemini API key is set. " +
        "Add a valid GEMINI_API_KEY to your .env and restart the API to enable live answers.";
      return;
    }
    const model = this.client.getGenerativeModel({
      model: this.config.get<string>("gemini.llmModel") ?? "gemini-2.5-pro",
      systemInstruction: system,
    });
    const res = await model.generateContentStream({
      contents: messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      })),
    });
    for await (const chunk of res.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }

  /** Embed a single query text into a vector. */
  async embed(text: string): Promise<number[]> {
    const [v] = await this.embedViaRest([text], "RETRIEVAL_QUERY");
    return v;
  }

  /** Batch embed documents. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.embedViaRest(texts, "RETRIEVAL_DOCUMENT");
  }

  /**
   * Embeds via the Generative Language REST API directly.
   *
   * We bypass the installed SDK here because `gemini-embedding-001` defaults
   * to 3072-dim output and the SDK (v0.21) exposes no way to set
   * `outputDimensionality`. We pin the size to EMBEDDING_DIMENSIONS (768) so
   * the vectors keep matching the `vector(768)` column and its index, then
   * L2-normalize (recommended by Google for non-3072 output sizes).
   */
  private async embedViaRest(
    texts: string[],
    taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
  ): Promise<number[][]> {
    if (!this.configured) {
      throw new Error(
        "Cannot embed: GEMINI_API_KEY is not configured. Set it in .env.",
      );
    }
    const key = this.config.get<string>("gemini.apiKey") ?? "";
    const raw = this.embedModelName;
    const model = raw.startsWith("models/") ? raw : `models/${raw}`;
    const dims = this.config.get<number>("gemini.dimensions") ?? 768;

    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents?key=${key}`;
    const body = {
      requests: texts.map((t) => ({
        model,
        content: { parts: [{ text: t }] },
        taskType,
        outputDimensionality: dims,
      })),
    };

    // Node 20+ global fetch (not in the ES2022 lib types, so via globalThis).
    const fetchFn = (globalThis as { fetch?: any }).fetch;
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(
        `Gemini embeddings failed [${res.status}]: ${detail.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as {
      embeddings?: { values: number[] }[];
    };
    return (json.embeddings ?? []).map((e) => this.l2normalize(e.values));
  }

  private l2normalize(v: number[]): number[] {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}
