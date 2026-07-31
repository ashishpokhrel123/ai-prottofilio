import { io, type Socket } from "socket.io-client";
import type { ChatStreamChunk } from "@ai-portfolio/shared";
import { API_BASE_URL } from "./api/config";
import type { StreamChatParams } from "./chat-client";

/** A connect that hasn't succeeded by now is not going to; fall back to SSE. */
const CONNECT_TIMEOUT_MS = 4000;

/**
 * Socket.IO chat transport.
 *
 * The API has exposed a `/chat` gateway all along and `socket.io-client` was
 * already a dependency — nothing on this side ever spoke to it. It matters
 * because SSE over HTTP/1.1 shares the browser's six-connection-per-origin
 * budget, so a chat stream can block other requests to the same origin; a
 * WebSocket does not.
 *
 * The gateway needs a process that outlives the request, which not every host
 * provides. `streamChat` therefore treats this as an optimisation and falls
 * back to SSE whenever the socket can't be established.
 */
export async function* streamChatOverSocket(
  params: StreamChatParams,
): AsyncGenerator<ChatStreamChunk> {
  const socket = await connect(params.signal);

  // A bounded queue between the socket's callbacks and this generator: chunks
  // arrive whenever the server sends them, but are yielded only as fast as the
  // consumer pulls, so no token can be dropped between iterations.
  const pending: ChatStreamChunk[] = [];
  let notify: (() => void) | null = null;
  let finished = false;
  let failure: Error | null = null;

  const wake = () => {
    notify?.();
    notify = null;
  };

  const push = (chunk: ChatStreamChunk) => {
    pending.push(chunk);
    if (chunk.type === "done" || chunk.type === "error") finished = true;
    wake();
  };

  const fail = (message: string) => {
    failure = new Error(message);
    finished = true;
    wake();
  };

  socket.on("chunk", push);
  socket.on("disconnect", () => {
    if (!finished) fail("The connection to the assistant dropped.");
  });
  socket.on("connect_error", () => fail("Could not reach the assistant."));

  const onAbort = () => {
    finished = true;
    wake();
  };
  params.signal?.addEventListener("abort", onAbort, { once: true });

  socket.emit("ask", {
    message: params.message,
    conversationId: params.conversationId,
    visitorId: params.visitorId,
  });

  try {
    for (;;) {
      while (pending.length > 0) {
        const chunk = pending.shift();
        if (chunk) yield chunk;
      }

      if (params.signal?.aborted) return;
      if (failure) throw failure;
      if (finished) return;

      await new Promise<void>((resolve) => {
        notify = resolve;
      });
    }
  } finally {
    params.signal?.removeEventListener("abort", onAbort);
    // Disconnecting triggers the gateway's `handleDisconnect`, which aborts
    // the in-flight agent run — so stopping the UI actually stops the work.
    socket.removeAllListeners();
    socket.disconnect();
  }
}

function connect(signal?: AbortSignal): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${API_BASE_URL}/chat`, {
      // The gateway is either there or it isn't; retrying delays the SSE
      // fallback and leaves the visitor watching an empty bubble.
      transports: ["websocket"],
      reconnection: false,
      timeout: CONNECT_TIMEOUT_MS,
      withCredentials: false,
    });

    const settle = (fn: () => void) => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
      fn();
    };

    const onConnect = () => settle(() => resolve(socket));
    const onError = () =>
      settle(() => {
        socket.disconnect();
        reject(new Error("WebSocket transport unavailable."));
      });

    const timer = setTimeout(onError, CONNECT_TIMEOUT_MS);

    socket.once("connect", onConnect);
    socket.once("connect_error", onError);

    signal?.addEventListener("abort", onError, { once: true });
  });
}
