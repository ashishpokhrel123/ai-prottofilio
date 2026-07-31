/**
 * Retry with exponential backoff and jitter.
 *
 * Written for LLM and embedding providers, where 429 (rate limit) and 5xx are
 * routine rather than exceptional — a free-tier quota is a handful of requests
 * per minute, and a bulk re-index will cross it every time. Failing the whole
 * document on the first 429 turns a delay into data loss.
 */

export interface RetryOptions {
  readonly attempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Decides whether a given failure is worth retrying. */
  readonly isRetryable?: (err: unknown) => boolean;
  readonly onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
  readonly signal?: AbortSignal;
}

const DEFAULTS = {
  attempts: 4,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
} as const;

export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? DEFAULTS.attempts;
  const baseDelay = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelay = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const isRetryable = options.isRetryable ?? (() => true);

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt === attempts;
      if (isLastAttempt || !isRetryable(err) || options.signal?.aborted) {
        throw err;
      }

      const delay = backoffDelay(attempt, baseDelay, maxDelay);
      options.onRetry?.(attempt, delay, err);
      await sleep(delay, options.signal);
    }
  }

  throw lastError;
}

/**
 * Exponential backoff with full jitter.
 *
 * Jitter matters here: the worker runs several jobs concurrently, and without
 * it every one would retry on the same schedule and re-trigger the same rate
 * limit in lockstep.
 */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  return Math.round(exponential / 2 + Math.random() * (exponential / 2));
}

/** Status codes worth another attempt: rate limits and transient server faults. */
export const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Detects a retryable provider failure. SDK errors vary in shape, so this
 * checks a `status` property first and falls back to matching the message.
 */
export function isRetryableProviderError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return RETRYABLE_STATUS.has(status);
  }

  const message = err instanceof Error ? err.message : String(err);
  return /\b(429|408|500|502|503|504)\b|rate.?limit|quota|overloaded|timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
    message,
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Retry aborted"));
      },
      { once: true },
    );
  });
}
