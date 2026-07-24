import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../common/config/prisma.service";
import { LlmMessage } from "../llm/gemini.service";

export interface ConversationMemory {
  history: LlmMessage[];
  lastEntities: string[];
}

/**
 * Conversation memory. Loads the recent turns so the agent can resolve
 * pronouns ("how was IT deployed?") and keep context across questions.
 *
 * Persistence is best-effort: if the database is unreachable or not yet
 * migrated, memory degrades to an in-request ephemeral conversation instead
 * of aborting the whole chat stream (which surfaced to users as
 * "stream failed"). Failures are logged so the misconfiguration stays visible.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly WINDOW = 10;

  constructor(private readonly prisma: PrismaService) {}

  async load(conversationId?: string): Promise<ConversationMemory> {
    if (!conversationId) return { history: [], lastEntities: [] };
    try {
      const messages = await this.prisma.message.findMany({
        where: { conversationId, role: { in: ["user", "assistant"] } },
        orderBy: { createdAt: "desc" },
        take: this.WINDOW,
      });
      const ordered = messages.reverse();
      const history: LlmMessage[] = ordered.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        content: m.content,
      }));
      const lastUser = ordered.filter((m) => m.role === "user").pop();
      const lastEntities = lastUser
        ? this.extractEntities(lastUser.content)
        : [];
      return { history, lastEntities };
    } catch (err) {
      this.warnDbUnavailable("load history", err);
      return { history: [], lastEntities: [] };
    }
  }

  async ensureConversation(
    conversationId: string | undefined,
    visitorId?: string,
  ): Promise<string> {
    try {
      if (conversationId) {
        const existing = await this.prisma.conversation.findUnique({
          where: { id: conversationId },
        });
        if (existing) return existing.id;
      }
      const created = await this.prisma.conversation.create({
        data: { visitorId },
      });
      return created.id;
    } catch (err) {
      this.warnDbUnavailable("ensure conversation", err);
      // Ephemeral id keeps the current turn working without persistence.
      return conversationId ?? randomUUID();
    }
  }

  async append(
    conversationId: string,
    role: string,
    content: string,
    extra: { citations?: unknown; toolTrace?: unknown } = {},
  ): Promise<string> {
    try {
      const msg = await this.prisma.message.create({
        data: {
          conversationId,
          role,
          content,
          citations: (extra.citations as any) ?? undefined,
          toolTrace: (extra.toolTrace as any) ?? undefined,
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      return msg.id;
    } catch (err) {
      this.warnDbUnavailable("append message", err);
      return randomUUID();
    }
  }

  private warnDbUnavailable(op: string, err: unknown): void {
    this.logger.warn(
      `[memory] ${op} failed — running without persistence for this turn. ` +
        `Is Postgres running and migrated (pnpm db:migrate)? ` +
        `Cause: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  private extractEntities(text: string): string[] {
    const caps = text.match(/\b([A-Z][a-zA-Z0-9]+)\b/g) ?? [];
    return Array.from(new Set(caps));
  }
}
