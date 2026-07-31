/**
 * Bounds a promise with a timeout.
 *
 * Every call that crosses a network boundary needs one. An unreachable host
 * (as opposed to one actively refusing) leaves a socket hanging for far longer
 * than any caller expects — which is how a readiness probe ends up blocking
 * for minutes and telling its orchestrator nothing at all.
 */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label = "operation",
): Promise<T> {
  let timer: NodeJS.Timeout;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new TimeoutError(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });

  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timer),
  ) as Promise<T>;
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Runs a check that must never throw or hang, returning `fallback` if it does.
 * Used by health probes, where a failed check is information, not an error.
 */
export async function safeCheck<T>(
  check: () => PromiseLike<T>,
  fallback: T,
  ms: number,
  label: string,
): Promise<T> {
  try {
    return await withTimeout(check(), ms, label);
  } catch {
    return fallback;
  }
}
