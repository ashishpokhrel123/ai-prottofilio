import { apiUrl } from "./config";

/**
 * An API failure with the status code preserved.
 *
 * Callers need to distinguish "your token expired" (401 → sign out) from
 * "the server is down" (503 → retry), and a bare `Error` throws that away.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** True when retrying later is a reasonable thing for the caller to do. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** Serialised as JSON unless it is already a FormData instance. */
  body?: unknown;
  token?: string;
}

/**
 * Typed fetch wrapper.
 *
 * Always throws `ApiError` on failure — the previous implementation returned
 * `{ ok, data, error }`, which every call site had to remember to check and
 * which silently produced `undefined` data when they forgot.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, token, headers, ...rest } = options;

  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...rest,
      headers: {
        // FormData must set its own multipart boundary; never override it.
        ...(isFormData || body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: isFormData
        ? (body as FormData)
        : body === undefined
          ? undefined
          : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(
      0,
      err instanceof Error && err.name === "AbortError"
        ? "Request cancelled."
        : "Could not reach the server. Check your connection and try again.",
    );
  }

  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractMessage(payload, response),
      payload,
    );
  }

  return payload as T;
}

/** Unwraps Nest's error shapes, where `message` may be a validation array. */
function extractMessage(payload: unknown, response: Response): string {
  // The throttler's own message is "ThrottlerException: Too Many Requests",
  // which reads like a crash. Login is limited to 5 attempts a minute, so this
  // is a message real users hit — it should tell them what to do.
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    return retryAfter
      ? `Too many attempts. Please wait ${retryAfter} seconds and try again.`
      : "Too many attempts. Please wait a minute and try again.";
  }

  if (response.status === 503) {
    return "The server is temporarily unavailable. Please try again shortly.";
  }

  if (typeof payload === "string" && payload.trim()) return payload;

  if (typeof payload === "object" && payload !== null) {
    const { message } = payload as { message?: unknown };

    if (Array.isArray(message)) return message.join(", ");
    if (typeof message === "string" && message) return message;
  }

  return `Request failed with status ${response.status}.`;
}
