import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { errorMessage } from "../../core/errors/domain.errors";
import type { LlmMessage } from "../../core/ports";

export interface ConversationMemory {
  readonly history: readonly LlmMessage[];
  /** Capitalised tokens from the last user turn — anchors for pronoun resolution. */
  readonly lastEntities: readonly string[];
}

const EMPTY_MEMORY: ConversationMemory = Object.freeze({
  history: [],
  lastEntities: [],
});

/** Turns kept in context. Enough for pronoun resolution without bloating prompts. */
const WINDOW = 10;

export interface MessageMetadata {
  readonly citations?: unknown;
  readonly toolTrace?: unknown;
}

/**
 * Conversation memory.
 *
 * Persistence is deliberately best-effort. If Postgres is unreachable the chat
 * degrades to a single stateless turn instead of failing outright — a visitor
 * still gets an answer, and the misconfiguration is loud in the logs rather
 * than in the UI.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async load(conversationId?: string): Promise<ConversationMemory> {
    if (!conversationId) return EMPTY_MEMORY;

    try {
      const recent = await this.prisma.message.findMany({
        where: { conversationId, role: { in: ["user", "assistant"] } },
        orderBy: { createdAt: "desc" },
        take: WINDOW,
        select: { role: true, content: true },
      });

      const ordered = recent.reverse();
      const lastUser = ordered.filter((m) => m.role === "user").pop();

      return {
        history: ordered.map((m) => ({
          role: m.role === "assistant" ? ("model" as const) : ("user" as const),
          content: m.content,
        })),
        lastEntities: lastUser ? extractEntities(lastUser.content) : [],
      };
    } catch (err) {
      this.warnUnavailable("load history", err);
      return EMPTY_MEMORY;
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
          select: { id: true },
        });
        if (existing) return existing.id;
      }

      const created = await this.prisma.conversation.create({
        data: { visitorId },
        select: { id: true },
      });
      return created.id;
    } catch (err) {
      this.warnUnavailable("create conversation", err);
      // An ephemeral id keeps this turn coherent without persistence.
      return conversationId ?? randomUUID();
    }
  }

  async append(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    metadata: MessageMetadata = {},
  ): Promise<string> {
    try {
      // One transaction: a message row and its conversation timestamp must
      // not drift apart.
      const message = await this.prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            conversationId,
            role,
            content,
            citations: metadata.citations as Prisma.InputJsonValue | undefined,
            toolTrace: metadata.toolTrace as Prisma.InputJsonValue | undefined,
          },
          select: { id: true },
        });

        await tx.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        return created;
      });

      return message.id;
    } catch (err) {
      this.warnUnavailable("append message", err);
      return randomUUID();
    }
  }

  private warnUnavailable(operation: string, err: unknown): void {
    this.logger.warn(
      `Could not ${operation} — running without persistence for this turn. ` +
        `Is Postgres reachable and migrated (pnpm db:migrate)? Cause: ${errorMessage(err)}`,
    );
  }
}

/** Naive proper-noun extraction; good enough to anchor "it"/"that" references. */
function extractEntities(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-zA-Z0-9]+\b/g) ?? [];
  return Array.from(new Set(matches));
}
