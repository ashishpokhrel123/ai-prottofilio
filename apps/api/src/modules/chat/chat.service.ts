import { Injectable } from "@nestjs/common";
import { ChatStreamChunk } from "@ai-portfolio/shared";
import { AgentOrchestrator } from "../../lib/agent/agent.orchestrator";
import { MemoryService } from "../../lib/memory/memory.service";
import { AnalyticsService } from "../analytics/analytics.service";

/**
 * Application service for chat. Owns the conversation lifecycle and adapts
 * agent events into transport-agnostic ChatStreamChunk messages.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly agent: AgentOrchestrator,
    private readonly memory: MemoryService,
    private readonly analytics: AnalyticsService,
  ) {}

  async *ask(params: {
    message: string;
    conversationId?: string;
    visitorId?: string;
  }): AsyncGenerator<ChatStreamChunk> {
    const conversationId = await this.memory.ensureConversation(
      params.conversationId,
      params.visitorId,
    );
    await this.memory.append(conversationId, "user", params.message);
    void this.analytics.track("question", params.visitorId, {
      message: params.message,
    });

    yield { type: "token", content: "", conversationId };

    for await (const ev of this.agent.run(params.message, conversationId)) {
      switch (ev.type) {
        case "tool_start":
          yield { type: "tool_start", tool: ev.tool };
          break;
        case "tool_end":
          yield { type: "tool_end", tool: ev.tool };
          break;
        case "citations":
          yield { type: "citations", citations: ev.citations };
          break;
        case "token":
          yield { type: "token", content: ev.content, conversationId };
          break;
        case "done":
          yield { type: "done", conversationId, messageId: ev.messageId };
          break;
        case "error":
          yield { type: "error", content: ev.content, conversationId };
          break;
      }
    }
  }
}
