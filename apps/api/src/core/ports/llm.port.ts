/** A single turn in a conversation, in provider-neutral form. */
export interface LlmMessage {
  readonly role: "user" | "model";
  readonly content: string;
}

export interface LlmCompletionOptions {
  /** Abort in-flight generation when the client disconnects. */
  readonly signal?: AbortSignal;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

/**
 * Text generation. Implemented by `GeminiLlmAdapter`; an OpenAI or Anthropic
 * adapter would satisfy the same contract with no change to the agent.
 */
export interface LlmPort {
  /** Whether the provider has usable credentials. */
  readonly isConfigured: boolean;

  /** Model identifier, for logs and diagnostics. */
  readonly model: string;

  /**
   * Confirms the credentials actually work against the configured model.
   *
   * `isConfigured` only reports that a key is *present*, which is why a
   * revoked or mistyped key can still look healthy. This asks the provider.
   * Never throws — a failure is the answer, not an exception.
   */
  verify(): Promise<{ ok: boolean; detail?: string }>;

  /** Single-shot completion. Throws `DependencyUnavailableError` on failure. */
  complete(
    system: string,
    messages: readonly LlmMessage[],
    options?: LlmCompletionOptions,
  ): Promise<string>;

  /** Streaming completion, yielding text deltas as they arrive. */
  stream(
    system: string,
    messages: readonly LlmMessage[],
    options?: LlmCompletionOptions,
  ): AsyncGenerator<string>;
}
