import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayDisconnect,
} from "@nestjs/websockets";
import type { Socket } from "socket.io";
import { errorDetail } from "../../core/errors/domain.errors";
import { ChatService } from "./chat.service";

interface AskPayload {
  message?: unknown;
  conversationId?: unknown;
  visitorId?: unknown;
}

/**
 * Socket.IO transport — the same agent, streamed over a WebSocket.
 *
 * Needs a process that outlives the request, which the container deploy has.
 * Some serverless hosts now offer this too (Vercel serves WebSockets on Fluid
 * compute), but it is not a safe assumption, so SSE remains the default path
 * and this is opt-in via `NEXT_PUBLIC_CHAT_TRANSPORT=socket`.
 */
@WebSocketGateway({
  namespace: "/chat",
  cors: { origin: (process.env.APP_URL ?? "").split(",").filter(Boolean) },
})
export class ChatGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  /** One abort controller per socket, so a disconnect cancels its run. */
  private readonly inFlight = new Map<string, AbortController>();

  constructor(private readonly chat: ChatService) {}

  @SubscribeMessage("ask")
  async onAsk(
    @MessageBody() payload: AskPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const message =
      typeof payload?.message === "string" ? payload.message.trim() : "";

    if (!message) {
      client.emit("chunk", {
        type: "error",
        content: "A non-empty message is required.",
      });
      return;
    }

    // One in-flight answer per socket: a client spamming "ask" should not be
    // able to start unbounded concurrent agent runs.
    this.abort(client.id);
    const controller = new AbortController();
    this.inFlight.set(client.id, controller);

    try {
      for await (const chunk of this.chat.ask({
        message,
        conversationId: asOptionalString(payload.conversationId),
        visitorId: asOptionalString(payload.visitorId),
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) return;
        client.emit("chunk", chunk);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      this.logger.error(`WebSocket chat failed: ${errorDetail(err)}`);
      client.emit("chunk", {
        type: "error",
        content: "The assistant hit an error and couldn't finish responding.",
      });
    } finally {
      this.inFlight.delete(client.id);
      if (!controller.signal.aborted) client.emit("chunk", { type: "done" });
    }
  }

  handleDisconnect(client: Socket): void {
    this.abort(client.id);
  }

  private abort(clientId: string): void {
    this.inFlight.get(clientId)?.abort();
    this.inFlight.delete(clientId);
  }
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
