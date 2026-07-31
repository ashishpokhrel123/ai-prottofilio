import type { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { MemoryService } from "./memory.service";

const DB_DOWN = new Error("Can't reach database server");

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    message: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "msg-1" }),
    },
    conversation: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "conv-new" }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      typeof fn === "function"
        ? fn({
            message: { create: jest.fn().mockResolvedValue({ id: "msg-1" }) },
            conversation: { update: jest.fn().mockResolvedValue({}) },
          })
        : undefined,
    ),
    ...overrides,
  } as unknown as PrismaService;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("MemoryService", () => {
  describe("load", () => {
    it("returns empty memory when there is no conversation id", async () => {
      const prisma = makePrisma();
      const memory = new MemoryService(prisma);

      expect(await memory.load()).toEqual({ history: [], lastEntities: [] });
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it("returns history oldest-first and maps assistant to the model role", async () => {
      // The query orders newest-first; the prompt needs chronological order.
      const prisma = makePrisma({
        message: {
          findMany: jest.fn().mockResolvedValue([
            { role: "assistant", content: "second" },
            { role: "user", content: "first" },
          ]),
        },
      });

      const { history } = await new MemoryService(prisma).load("conv-1");

      expect(history).toEqual([
        { role: "user", content: "first" },
        { role: "model", content: "second" },
      ]);
    });

    it("extracts capitalised entities from the last user turn", async () => {
      const prisma = makePrisma({
        message: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { role: "user", content: "tell me about Immortalis and NestJS" },
            ]),
        },
      });

      const { lastEntities } = await new MemoryService(prisma).load("conv-1");

      expect(lastEntities).toEqual(["Immortalis", "NestJS"]);
    });
  });

  /**
   * Persistence is best-effort by design: a database outage should cost the
   * visitor conversation continuity, not the answer itself.
   */
  describe("degradation when the database is unavailable", () => {
    it("returns empty history instead of throwing", async () => {
      const prisma = makePrisma({
        message: { findMany: jest.fn().mockRejectedValue(DB_DOWN) },
      });

      await expect(new MemoryService(prisma).load("conv-1")).resolves.toEqual({
        history: [],
        lastEntities: [],
      });
    });

    it("falls back to an ephemeral conversation id", async () => {
      const prisma = makePrisma({
        conversation: {
          findUnique: jest.fn().mockRejectedValue(DB_DOWN),
          create: jest.fn().mockRejectedValue(DB_DOWN),
        },
      });

      const id = await new MemoryService(prisma).ensureConversation(undefined);

      expect(id).toMatch(UUID);
    });

    it("preserves a caller-supplied id when persistence fails", async () => {
      const prisma = makePrisma({
        conversation: {
          findUnique: jest.fn().mockRejectedValue(DB_DOWN),
          create: jest.fn().mockRejectedValue(DB_DOWN),
        },
      });

      const id = await new MemoryService(prisma).ensureConversation("existing");

      expect(id).toBe("existing");
    });

    it("returns a synthetic message id rather than failing the turn", async () => {
      const prisma = makePrisma({
        $transaction: jest.fn().mockRejectedValue(DB_DOWN),
      });

      const id = await new MemoryService(prisma).append(
        "conv-1",
        "assistant",
        "answer",
      );

      expect(id).toMatch(UUID);
    });
  });

  describe("ensureConversation", () => {
    it("reuses an existing conversation", async () => {
      const prisma = makePrisma({
        conversation: {
          findUnique: jest.fn().mockResolvedValue({ id: "conv-existing" }),
          create: jest.fn(),
        },
      });

      const id = await new MemoryService(prisma).ensureConversation(
        "conv-existing",
      );

      expect(id).toBe("conv-existing");
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it("creates one when the supplied id is unknown", async () => {
      const prisma = makePrisma();

      expect(
        await new MemoryService(prisma).ensureConversation("stale-id", "vis-1"),
      ).toBe("conv-new");
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: { visitorId: "vis-1" },
        select: { id: true },
      });
    });
  });

  describe("append", () => {
    it("writes the message and touches the conversation in one transaction", async () => {
      const prisma = makePrisma();

      const id = await new MemoryService(prisma).append(
        "conv-1",
        "assistant",
        "answer",
        { citations: [], toolTrace: ["project_search"] },
      );

      expect(id).toBe("msg-1");
      // One transaction: the row and its parent timestamp must not drift.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
