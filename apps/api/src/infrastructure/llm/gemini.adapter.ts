import { Injectable, Logger } from "@nestjs/common";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AppConfigService } from "../../common/config/app-config.service";
import { isRetryableProviderError, retry } from "../../common/utils/retry";
import {
  DependencyUnavailableError,
  errorMessage,
} from "../../core/errors/domain.errors";
import type {
  EmbeddingPort,
  LlmCompletionOptions,
  LlmMessage,
  LlmPort,
} from "../../core/ports";

const EMBED_BATCH_LIMIT = 100;
const MAX_EMBED_INPUT_CHARS = 8_000;

/**
 * Google Gemini adapter, satisfying both `LlmPort` and `EmbeddingPort`.
 *
 * Every SDK/network failure is translated into `DependencyUnavailableError` so
 * callers never have to know a Google SDK exists.
 */
@Injectable()
export class GeminiAdapter implements LlmPort, EmbeddingPort {
  private readonly logger = new Logger(GeminiAdapter.name);
  private readonly client: GoogleGenerativeAI;

  readonly isConfigured: boolean;
  readonly model: string;
  readonly dimensions: number;

  constructor(private readonly config: AppConfigService) {
    const gemini = config.gemini;
    this.isConfigured = gemini.isConfigured;
    this.model = gemini.llmModel;
    this.dimensions = gemini.dimensions;
    this.client = new GoogleGenerativeAI(gemini.apiKey);

    if (!this.isConfigured) {
      this.logger.warn(
        "GEMINI_API_KEY is unset or still a placeholder — the assistant will " +
          "return a setup notice instead of generated answers.",
      );
    }
  }

  // ---------------------------------------------------------------- LlmPort

  async complete(
    system: string,
    messages: readonly LlmMessage[],
    options?: LlmCompletionOptions,
  ): Promise<string> {
    if (!this.isConfigured) return "";

    try {
      const model = this.generativeModel(system);
      const res = await model.generateContent(
        {
          contents: this.toContents(messages),
          generationConfig: this.generationConfig(options),
        },
        { signal: options?.signal },
      );
      return res.response.text();
    } catch (err) {
      throw this.wrap("completion", err);
    }
  }

  async *stream(
    system: string,
    messages: readonly LlmMessage[],
    options?: LlmCompletionOptions,
  ): AsyncGenerator<string> {
    if (!this.isConfigured) {
      yield "This assistant isn't fully configured yet — no language-model API key is set.";
      return;
    }

    let stream: AsyncGenerator<{ text(): string }>;
    try {
      const model = this.generativeModel(system);
      const res = await model.generateContentStream(
        {
          contents: this.toContents(messages),
          generationConfig: this.generationConfig(options),
        },
        { signal: options?.signal },
      );
      stream = res.stream as AsyncGenerator<{ text(): string }>;
    } catch (err) {
      throw this.wrap("streaming completion", err);
    }

    try {
      for await (const chunk of stream) {
        const text = chunk.text();
        if (text) yield text;
      }
    } catch (err) {
      // A mid-stream abort is a normal client disconnect, not a fault.
      if (options?.signal?.aborted) return;
      throw this.wrap("streaming completion", err);
    }
  }

  // ---------------------------------------------------------- EmbeddingPort

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed(
      [this.normalize(text)],
      "RETRIEVAL_QUERY",
    );
    if (!vector) {
      throw new DependencyUnavailableError(
        "gemini",
        "Embedding provider returned no vector for the query.",
      );
    }
    return vector;
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const normalized = texts.map((t) => this.normalize(t));
    const out: number[][] = [];

    // The batch endpoint caps request size; chunk rather than fail on large docs.
    for (let i = 0; i < normalized.length; i += EMBED_BATCH_LIMIT) {
      const slice = normalized.slice(i, i + EMBED_BATCH_LIMIT);
      out.push(...(await this.embed(slice, "RETRIEVAL_DOCUMENT")));
    }

    if (out.length !== texts.length) {
      throw new DependencyUnavailableError(
        "gemini",
        `Embedding count mismatch: expected ${texts.length}, received ${out.length}.`,
      );
    }
    return out;
  }

  // --------------------------------------------------------------- internals

  private generativeModel(system: string) {
    return this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: system,
    });
  }

  private generationConfig(options?: LlmCompletionOptions) {
    return {
      ...(options?.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options?.maxOutputTokens !== undefined
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
    };
  }

  private toContents(messages: readonly LlmMessage[]) {
    return messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));
  }

  private normalize(text: string): string {
    return text.replace(/\s+/g, " ").trim().slice(0, MAX_EMBED_INPUT_CHARS);
  }

  /**
   * Calls the batch-embed REST endpoint directly rather than via the SDK.
   *
   * The SDK (v0.21) exposes no way to set `outputDimensionality`, and the
   * newer embedding models default to 3072 dimensions — which silently breaks
   * inserts into the `vector(768)` column. Pinning the size here keeps the
   * index valid; L2 normalisation is what Google recommends whenever a
   * non-default output size is requested.
   */
  private async embed(
    texts: readonly string[],
    taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
  ): Promise<number[][]> {
    if (!this.isConfigured) {
      throw new DependencyUnavailableError(
        "gemini",
        "Cannot embed: GEMINI_API_KEY is not configured.",
      );
    }

    const raw = this.config.gemini.embeddingModel;
    const model = raw.startsWith("models/") ? raw : `models/${raw}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents`;

    const body = JSON.stringify({
      requests: texts.map((text) => ({
        model,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: this.dimensions,
      })),
    });

    /**
     * Retried with backoff. Embedding quotas are measured in a handful of
     * requests per minute on a free key, and the ingestion worker runs several
     * jobs at once — so a 429 mid-way through a document is routine, not
     * exceptional. Failing outright would abandon the whole document.
     */
    const json = await retry(
      async () => {
        let res: Response;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Header auth, so the key never lands in a loggable URL.
              "x-goog-api-key": this.config.gemini.apiKey,
            },
            body,
          });
        } catch (err) {
          throw this.wrap("embeddings", err);
        }

        if (!res.ok) {
          const detail = (await res.text()).slice(0, 300);
          const error = new DependencyUnavailableError(
            "gemini",
            `Embeddings request failed [${res.status}]: ${detail}`,
          );
          // Surfaced so the retry predicate can distinguish a rate limit from
          // a permanently bad request (a 400 must not be retried four times).
          Object.assign(error, { status: res.status });
          throw error;
        }

        return (await res.json()) as { embeddings?: { values: number[] }[] };
      },
      {
        isRetryable: isRetryableProviderError,
        onRetry: (attempt, delayMs, err) =>
          this.logger.warn(
            `Embeddings attempt ${attempt} failed (${errorMessage(err)}); ` +
              `retrying in ${delayMs}ms`,
          ),
      },
    );

    return (json.embeddings ?? []).map((e) => this.l2normalize(e.values));
  }

  private l2normalize(v: readonly number[]): number[] {
    const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }

  private wrap(operation: string, err: unknown): DependencyUnavailableError {
    const message = `Gemini ${operation} failed: ${errorMessage(err)}`;
    this.logger.error(message);
    return new DependencyUnavailableError("gemini", message, { cause: err });
  }
}
