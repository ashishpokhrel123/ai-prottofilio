import { Injectable, Logger } from "@nestjs/common";
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

/**
 * NVIDIA NIM adapter, satisfying both `LlmPort` and `EmbeddingPort`.
 *
 * Written against the OpenAI-compatible surface rather than an NVIDIA SDK, for
 * one reason: the same wire format is what a self-hosted NIM container and a
 * vLLM server expose. Moving off the hosted endpoint — which NVIDIA licenses
 * for development and evaluation only — is then a change to `NVIDIA_BASE_URL`
 * and nothing else. An SDK would have bought convenience at the cost of that.
 *
 * Every network failure is translated into `DependencyUnavailableError` so
 * callers never learn which vendor is behind the port.
 */

/** Hosted NIM. Point at `http://localhost:8000/v1` for a local container. */
export const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";


/**
 * The embeddings endpoint accepts a list, but the hosted tier is metered in
 * requests per minute and rejects oversized payloads outright. 64 keeps a
 * single request comfortably inside the limit while still amortising the
 * round-trip across a re-index.
 */
const EMBED_BATCH_LIMIT = 64;

/**
 * Nemotron-3-Embed-1B accepts 32k tokens, far more than a RAG chunk needs.
 * Trimming here is about bounding the request body, not the model: an
 * accidental whole-document embed would otherwise silently cost a large,
 * slow call. `RAG_CHUNK_SIZE` is the real limit and is much smaller.
 */
const MAX_EMBED_INPUT_CHARS = 32_000;

interface EmbeddingResponse {
  readonly data?: readonly { index: number; embedding: number[] }[];
}

interface ChatChunk {
  readonly choices?: readonly {
    readonly delta?: { readonly content?: string | null };
    readonly message?: { readonly content?: string | null };
  }[];
}

@Injectable()
export class NvidiaAdapter implements LlmPort, EmbeddingPort {
  private readonly logger = new Logger(NvidiaAdapter.name);

  readonly isConfigured: boolean;
  readonly model: string;
  readonly dimensions: number;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly embeddingModel: string;

  /** Health probes poll; the provider does not need to be asked every time. */
  private static readonly VERIFY_TTL_MS = 60_000;
  private static readonly VERIFY_TIMEOUT_MS = 5_000;

  private verification?: {
    at: number;
    result: { ok: boolean; detail?: string };
  };

  constructor(private readonly config: AppConfigService) {
    const nvidia = config.nvidia;
    this.isConfigured = nvidia.isConfigured;
    this.model = nvidia.llmModel;
    this.embeddingModel = nvidia.embeddingModel;
    this.dimensions = nvidia.dimensions;
    this.apiKey = nvidia.apiKey;
    // Trailing slashes turn every path into a double-slash, which some
    // gateways 404 rather than normalise.
    this.baseUrl = nvidia.baseUrl.replace(/\/+$/, "");

    if (!this.isConfigured) {
      this.logger.warn(
        "NVIDIA_API_KEY is unset or still a placeholder — the assistant will " +
          "return a setup notice instead of generated answers.",
      );
    }
  }

  /**
   * Verifies the key against the model catalogue.
   *
   * `GET /models` rather than a one-token completion: it proves the key is
   * accepted and that the configured ids actually exist on this endpoint,
   * while consuming no generation quota. On a 40 req/min free tier, a health
   * check that spends a request from the same budget as user traffic is a
   * self-inflicted outage.
   */
  async verify(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.isConfigured) {
      return { ok: false, detail: "NVIDIA_API_KEY is not set" };
    }

    const cached = this.verification;
    if (cached && Date.now() - cached.at < NvidiaAdapter.VERIFY_TTL_MS) {
      return cached.result;
    }

    const result = await this.probeModels();
    this.verification = { at: Date.now(), result };
    return result;
  }

  private async probeModels(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(NvidiaAdapter.VERIFY_TIMEOUT_MS),
      });

      if (!res.ok) {
        const detail = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
        this.logger.error(`NVIDIA verification failed: ${detail}`);
        return { ok: false, detail };
      }

      const body = (await res.json()) as { data?: { id?: string }[] };
      const available = new Set((body.data ?? []).map((m) => m.id));

      // An empty catalogue means the endpoint answered but told us nothing —
      // true of some self-hosted gateways. Treat the key as good rather than
      // reporting a false outage over a missing convenience endpoint.
      if (available.size === 0) return { ok: true };

      const missing = [this.model, this.embeddingModel].filter(
        (id) => !available.has(id),
      );

      if (missing.length > 0) {
        const detail = `Model(s) not available on this endpoint: ${missing.join(", ")}`;
        this.logger.error(`NVIDIA verification failed: ${detail}`);
        return { ok: false, detail };
      }

      return { ok: true };
    } catch (err) {
      const detail = errorMessage(err);
      this.logger.error(`NVIDIA verification failed: ${detail}`);
      return { ok: false, detail };
    }
  }

  // ---------------------------------------------------------------- LlmPort

  async complete(
    system: string,
    messages: readonly LlmMessage[],
    options?: LlmCompletionOptions,
  ): Promise<string> {
    if (!this.isConfigured) return "";

    const res = await this.chat(system, messages, options, false);

    try {
      const body = (await res.json()) as ChatChunk;
      return body.choices?.[0]?.message?.content ?? "";
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

    const res = await this.chat(system, messages, options, true);
    const body = res.body;

    if (!body) {
      throw this.wrap(
        "streaming completion",
        new Error("Response carried no body"),
      );
    }

    try {
      yield* this.readSse(body, options?.signal);
    } catch (err) {
      // A mid-stream abort is a normal client disconnect, not a fault.
      if (options?.signal?.aborted) return;
      throw this.wrap("streaming completion", err);
    }
  }

  // ---------------------------------------------------------- EmbeddingPort

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([this.normalize(text)], "query");
    if (!vector) {
      throw new DependencyUnavailableError(
        "nvidia",
        "Embedding provider returned no vector for the query.",
      );
    }
    return vector;
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const normalized = texts.map((t) => this.normalize(t));
    const out: number[][] = [];

    for (let i = 0; i < normalized.length; i += EMBED_BATCH_LIMIT) {
      out.push(
        ...(await this.embed(
          normalized.slice(i, i + EMBED_BATCH_LIMIT),
          "passage",
        )),
      );
    }

    if (out.length !== texts.length) {
      throw new DependencyUnavailableError(
        "nvidia",
        `Embedding count mismatch: expected ${texts.length}, received ${out.length}.`,
      );
    }
    return out;
  }

  // --------------------------------------------------------------- internals

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async chat(
    system: string,
    messages: readonly LlmMessage[],
    options: LlmCompletionOptions | undefined,
    stream: boolean,
  ): Promise<Response> {
    const body = JSON.stringify({
      model: this.model,
      // The system turn is an ordinary message here, unlike Gemini's separate
      // `systemInstruction` field. Omitted when empty: some NIM chat templates
      // render an empty system block as literal whitespace in the prompt.
      messages: [
        ...(system.trim() ? [{ role: "system", content: system }] : []),
        ...messages.map((m) => ({
          // The port speaks Gemini's vocabulary; OpenAI calls it "assistant".
          role: m.role === "model" ? "assistant" : "user",
          content: m.content,
        })),
      ],
      ...(options?.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options?.maxOutputTokens !== undefined
        ? { max_tokens: options.maxOutputTokens }
        : {}),
      stream,
    });

    return this.request("/chat/completions", body, {
      signal: options?.signal,
      accept: stream ? "text/event-stream" : "application/json",
      // Streaming responses are consumed lazily, so a retry after the first
      // byte would replay a half-delivered answer to the client. Only the
      // buffered path is safe to repeat.
      retryable: !stream,
    });
  }

  /**
   * Parses an OpenAI-style SSE stream.
   *
   * Buffers on newline rather than trusting chunk boundaries: a `data:` frame
   * is routinely split across two TCP reads, and parsing per-chunk drops
   * exactly the tokens that straddle the boundary — which shows up as an
   * answer that reads fine but is quietly missing words.
   */
  private async *readSse(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);

          if (!line.startsWith("data:")) continue;

          const payload = line.slice(5).trim();
          if (payload === "[DONE]") return;

          let chunk: ChatChunk;
          try {
            chunk = JSON.parse(payload) as ChatChunk;
          } catch {
            // A frame we cannot parse is one lost token, not a dead stream.
            continue;
          }

          // Only `content`. Reasoning models also emit `reasoning_content`,
          // which is scratch work the visitor should never see rendered into
          // the chat transcript.
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        }
      }
    } finally {
      // Releasing the lock lets the connection be torn down promptly when the
      // consumer stops early — otherwise an abandoned stream pins a socket.
      if (!signal?.aborted) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  private normalize(text: string): string {
    return text.replace(/\s+/g, " ").trim().slice(0, MAX_EMBED_INPUT_CHARS);
  }

  /**
   * `input_type` is required, not optional.
   *
   * Nemotron-3-Embed is asymmetric: queries and passages are projected by
   * different instructions into the same space. Sending "passage" for a query
   * does not error — it returns a valid vector that retrieves measurably
   * worse, which is the failure mode that never gets noticed.
   */
  private async embed(
    texts: readonly string[],
    inputType: "query" | "passage",
  ): Promise<number[][]> {
    if (!this.isConfigured) {
      throw new DependencyUnavailableError(
        "nvidia",
        "Cannot embed: NVIDIA_API_KEY is not configured.",
      );
    }

    const body = JSON.stringify({
      model: this.embeddingModel,
      input: texts,
      input_type: inputType,
      encoding_format: "float",
      // Reject-by-default would fail a whole re-index over one long chunk.
      truncate: "END",
    });

    const res = await this.request("/embeddings", body, {
      accept: "application/json",
      retryable: true,
      label: "embeddings",
    });

    const json = (await res.json()) as EmbeddingResponse;
    const data = [...(json.data ?? [])];

    // Order is not guaranteed to match the input. `data[i]` looks right in
    // testing and silently pairs the wrong vector with the wrong chunk under
    // concurrency, so sort by the index the API returns.
    data.sort((a, b) => a.index - b.index);

    return data.map((d) => this.l2normalize(d.embedding));
  }

  /**
   * Cosine distance is scale-invariant, so normalising is not strictly
   * required — but `pgvector.store` also uses `1 - (a <=> b)` as a similarity
   * that `RAG_MIN_SIMILARITY` is compared against. Unit vectors keep that
   * threshold meaning the same thing it meant under Gemini, which was already
   * normalising. Without this the confidence gate would need retuning.
   */
  private l2normalize(v: readonly number[]): number[] {
    const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }

  /**
   * One place where every NIM call is issued, retried and error-wrapped.
   *
   * The free tier is ~40 requests per minute across *all* models, and a
   * re-index issues them in bursts, so 429 is an expected condition rather
   * than an exception. `isRetryableProviderError` reads the `status` property
   * attached below to tell a rate limit apart from a malformed request that
   * would fail identically four times over.
   */
  private async request(
    path: string,
    body: string,
    opts: {
      signal?: AbortSignal;
      accept: string;
      retryable: boolean;
      label?: string;
    },
  ): Promise<Response> {
    const label = opts.label ?? path.replace(/^\//, "");

    const send = async (): Promise<Response> => {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: { ...this.headers(), Accept: opts.accept },
          body,
          signal: opts.signal,
        });
      } catch (err) {
        throw this.wrap(label, err);
      }

      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        const error = new DependencyUnavailableError(
          "nvidia",
          `${label} request failed [${res.status}]: ${detail}`,
        );
        Object.assign(error, { status: res.status });
        throw error;
      }

      return res;
    };

    if (!opts.retryable) return send();

    return retry(send, {
      signal: opts.signal,
      isRetryable: isRetryableProviderError,
      onRetry: (attempt, delayMs, err) =>
        this.logger.warn(
          `NVIDIA ${label} attempt ${attempt} failed (${errorMessage(err)}); ` +
            `retrying in ${delayMs}ms`,
        ),
    });
  }

  private wrap(operation: string, err: unknown): DependencyUnavailableError {
    if (err instanceof DependencyUnavailableError) return err;
    const message = `NVIDIA ${operation} failed: ${errorMessage(err)}`;
    this.logger.error(message);
    return new DependencyUnavailableError("nvidia", message, { cause: err });
  }
}
