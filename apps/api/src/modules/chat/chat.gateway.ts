import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Socket } from "socket.io";
import { ChatService } from "./chat.service";

/** Socket.IO transport — same agent, streamed over WebSocket. */
@WebSocketGateway({
  cors: { origin: process.env.APP_URL ?? "*" },
  namespace: "/chat",
})
export class ChatGateway {
  constructor(private readonly chat: ChatService) {}

  @SubscribeMessage("ask")
  async onAsk(
    @MessageBody()
    body: { message: string; conversationId?: string; visitorId?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    for await (const chunk of this.chat.ask(body)) {
      client.emit("chunk", chunk);
    }
    client.emit("chunk", { type: "done" });
  }
}
