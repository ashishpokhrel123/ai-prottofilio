import { Injectable, Logger } from "@nestjs/common";
import type { ChatStreamChunk } from "@ai-portfolio/shared";
import { AgentOrchestrator } from "../../lib/agent/agent.orchestrator";
import { MemoryService } from "../../lib/memory/memory.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { analyticsEventForTool, toToolCard } from "./tool-cards";

export interface AskParams {
  readonly message: string;
  readonly conversationId?: string;
  readonly visitorId?: string;
  readonly signal?: AbortSignal;
}

/**
 * Application service for chat.
 *
 * Owns the conversation lifecycle and adapts agent events into
 * transport-agnostic `ChatStreamChunk`s, so SSE and WebSocket transports share
 * one implementation and cannot drift.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly agent: AgentOrchestrator,
    private readonly memory: MemoryService,
    private readonly analytics: AnalyticsService,
  ) {}

  async *ask(params: AskParams): AsyncGenerator<ChatStreamChunk> {
    const conversationId = await this.memory.ensureConversation(
      params.conversationId,
      params.visitorId,
    );

    await this.memory.append(conversationId, "user", params.message);

    // Analytics must never delay or break a chat turn.
    void this.analytics.trackSafely("question", params.visitorId, {
      message: params.message,
    });

    // An immediate empty token hands the conversation id to the client before
    // the first model token arrives, so a reload mid-answer can still resume.
    yield { type: "token", content: "", conversationId };

    for await (const event of this.agent.run(params.message, conversationId, {
      signal: params.signal,
    })) {
      switch (event.type) {
        case "tool_start":
          yield { type: "tool_start", tool: event.tool };
          break;
        case "tool_end": {
          // Which tools the agent chose is itself the signal: a question the
          // planner answered with `project_search` *is* a project view. This
          // is where `project_view` and `skill_query` come from — there is no
          // page for a visitor to land on to generate them.
          const eventType = analyticsEventForTool(event.tool);
          if (eventType) {
            void this.analytics.trackSafely(eventType, params.visitorId, {
              query: params.message,
            });
          }

          const card = toToolCard(event.tool, event.data);
          yield { type: "tool_end", tool: event.tool, data: card?.data };
          break;
        }
        case "citations":
          yield { type: "citations", citations: [...event.citations] };
          break;
        case "trace":
          // Forwarded verbatim. This is observational telemetry the agent
          // measured; the transport's job is to relay it, not to interpret,
          // round or embellish it.
          yield { type: "trace", trace: event.trace };
          break;
        case "token":
          yield { type: "token", content: event.content, conversationId };
          break;
        case "done":
          yield { type: "done", conversationId, messageId: event.messageId };
          break;
        case "error":
          yield { type: "error", content: event.content, conversationId };
          break;
        default: {
          // Exhaustiveness check: adding an AgentEvent variant without
          // handling it here becomes a compile error, not a silent drop.
          const unreachable: never = event;
          this.logger.warn(
            `Unhandled agent event: ${JSON.stringify(unreachable)}`,
          );
        }
      }
    }
  }
}
