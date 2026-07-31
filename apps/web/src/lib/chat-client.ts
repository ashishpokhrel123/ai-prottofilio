import type { ChatStreamChunk } from "@ai-portfolio/shared";
import { apiUrl } from "./api/config";

const VISITOR_ID_KEY = "ap_visitor_id";
const SSE_DONE = "[DONE]";

export interface StreamChatParams {
  message: string;
  conversationId?: string;
  visitorId: string;
  signal?: AbortSignal;
}

/**
 * Streams a chat response, preferring the WebSocket transport when enabled.
 *
 * `NEXT_PUBLIC_CHAT_TRANSPORT=socket` opts in; anything else uses SSE. It is
 * opt-in rather than automatic because the gateway requires a process that
 * outlives the request, and on a host without one every visitor would pay a
 * failed connection before the fallback.
 *
 * Failure to connect degrades to SSE rather than to an error — but only before
 * the first chunk. Once tokens are flowing, a drop is a real failure and is
 * surfaced, because replaying the turn would bill a second agent run and could
 * duplicate what the visitor already read.
 */
export async function* streamChat(
  params: StreamChatParams,
): AsyncGenerator<ChatStreamChunk> {
  if (!socketTransportEnabled()) {
    yield* streamChatOverSse(params);
    return;
  }

  let delivered = false;

  try {
    const { streamChatOverSocket } = await import("./socket-chat-client");
    for await (const chunk of streamChatOverSocket(params)) {
      delivered = true;
      yield chunk;
    }
  } catch (err) {
    if (delivered || params.signal?.aborted) throw err;
    yield* streamChatOverSse(params);
  }
}

/** Not named `use*` — that reads as a React hook to the linter and to people. */
function socketTransportEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHAT_TRANSPORT === "socket";
}

/**
 * Streams a chat response from the SSE endpoint.
 *
 * Implemented over `fetch` + `ReadableStream` rather than `EventSource`,
 * because `EventSource` cannot issue a POST and this request carries a body.
 */
export async function* streamChatOverSse(
  params: StreamChatParams,
): AsyncGenerator<ChatStreamChunk> {
  const response = await fetch(apiUrl("/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message: params.message,
      conversationId: params.conversationId,
      visitorId: params.visitorId,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    throw new Error(await describeFailure(response));
  }
  if (!response.body) {
    throw new Error("The server returned no response body.");
  }

  const body = response.body;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line. The final element is a
      // partial event and stays buffered until its terminator arrives.
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const chunk = parseEvent(event);
        if (chunk) yield chunk;
      }
    }
  } finally {
    // Releases the underlying connection when the consumer stops early — an
    // abandoned generator otherwise leaks the socket.
    reader.releaseLock();
    await body.cancel().catch(() => undefined);
  }
}

/** Parses one SSE event, ignoring comments, keepalives and the DONE sentinel. */
function parseEvent(event: string): ChatStreamChunk | null {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");

  if (!data || data === SSE_DONE) return null;

  try {
    return JSON.parse(data) as ChatStreamChunk;
  } catch {
    return null;
  }
}

async function describeFailure(response: Response): Promise<string> {
  if (response.status === 429) {
    return "You're sending messages a little too quickly. Please wait a moment and try again.";
  }

  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message;
    if (message) return message;
  } catch {
    // Fall through to the generic message.
  }

  return `The assistant is unavailable right now (status ${response.status}).`;
}

/**
 * A stable, anonymous id used to group a visitor's conversations.
 *
 * A UUID because the API validates it as one; `localStorage` because it should
 * survive a reload so a returning visitor's history stays connected.
 */
export function getVisitorId(): string {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(VISITOR_ID_KEY);
  if (existing && isUuid(existing)) return existing;

  const id = crypto.randomUUID();
  window.localStorage.setItem(VISITOR_ID_KEY, id);
  return id;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
