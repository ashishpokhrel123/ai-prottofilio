import { Prisma } from "@prisma/client";
import type { AppConfigService } from "../../common/config/app-config.service";
import {
  DependencyUnavailableError,
  InvalidInputError,
} from "../../core/errors/domain.errors";
import type { PrismaService } from "../persistence/prisma.service";
import { PgVectorStore } from "./pgvector.store";

const DIMENSIONS = 4;
const VECTOR = [0.1, 0.2, 0.3, 0.4];

function makeStore(queryResult: unknown[] = []) {
  const captured: Prisma.Sql[] = [];

  const prisma = {
    $queryRaw: jest.fn((sql: Prisma.Sql) => {
      captured.push(sql);
      return Promise.resolve(queryResult);
    }),
    $executeRaw: jest.fn((sql: Prisma.Sql) => {
      captured.push(sql);
      return Promise.resolve(1);
    }),
  } as unknown as PrismaService;

  const config = {
    gemini: { dimensions: DIMENSIONS },
  } as AppConfigService;

  return { store: new PgVectorStore(prisma, config), captured, prisma };
}

describe("PgVectorStore", () => {
  /**
   * The previous implementation built these queries with `$queryRawUnsafe` and
   * string interpolation, so any chat message reached the SQL parser. These
   * tests pin the parameterised replacement.
   */
  describe("SQL injection resistance", () => {
    const payloads = [
      '\'; DROP TABLE "Chunk"; --',
      "' OR '1'='1",
      '\\\'; DELETE FROM "Document"; --',
      "'||(SELECT version())||'",
      "test'); DROP TABLE users; --",
    ];

    it.each(payloads)(
      "binds %j as a parameter, never as SQL",
      async (payload) => {
        const { store, captured } = makeStore();

        await store.hybridSearch(VECTOR, payload, 5);

        const sql = captured[0];
        // The payload must appear in the bound values, not in the statement.
        expect(sql.values).toContain(payload);
        expect(sql.strings.join("")).not.toContain(payload);
        expect(sql.strings.join("")).not.toContain("DROP TABLE");
      },
    );

    it("binds tag filters as an array parameter", async () => {
      const { store, captured } = makeStore();

      await store.similaritySearch(VECTOR, 5, {
        tags: ["'; DROP TABLE x; --"],
      });

      expect(captured[0].strings.join("")).not.toContain("DROP TABLE");
    });

    it("truncates an absurdly long query before binding", async () => {
      const { store, captured } = makeStore();

      await store.hybridSearch(VECTOR, "x".repeat(5000), 5);

      const bound = captured[0].values.find(
        (v): v is string => typeof v === "string" && v.startsWith("xxx"),
      );
      expect(bound?.length).toBeLessThanOrEqual(1000);
    });
  });

  describe("metadata filter allow-lists", () => {
    it("accepts known enum members", async () => {
      const { store } = makeStore();

      await expect(
        store.similaritySearch(VECTOR, 5, {
          docTypes: ["RESUME", "PROJECT"],
          sources: ["GITHUB"],
        }),
      ).resolves.toEqual([]);
    });

    it.each([
      ["docTypes", { docTypes: ["RESUME'; DROP TABLE x; --"] }],
      ["docTypes", { docTypes: ["NOT_A_REAL_TYPE"] }],
      ["sources", { sources: ["EVIL"] }],
    ])("rejects an unknown %s value", async (_label, filter) => {
      const { store } = makeStore();

      await expect(store.similaritySearch(VECTOR, 5, filter)).rejects.toThrow(
        InvalidInputError,
      );
    });

    it("ignores empty filter arrays", async () => {
      const { store } = makeStore();

      await expect(
        store.similaritySearch(VECTOR, 5, { docTypes: [], tags: [] }),
      ).resolves.toEqual([]);
    });
  });

  describe("embedding validation", () => {
    it("rejects a wrongly-sized vector", async () => {
      const { store } = makeStore();

      // Silent dimension drift would corrupt the index rather than error.
      await expect(store.similaritySearch([0.1, 0.2], 5)).rejects.toThrow(
        /2 dimensions but the store expects 4/,
      );
    });

    it.each([
      ["NaN", [Number.NaN, 0.2, 0.3, 0.4]],
      ["Infinity", [Number.POSITIVE_INFINITY, 0.2, 0.3, 0.4]],
    ])("rejects a vector containing %s", async (_label, vector) => {
      const { store } = makeStore();

      await expect(store.similaritySearch(vector, 5)).rejects.toThrow(
        InvalidInputError,
      );
    });
  });

  describe("topK bounds", () => {
    it.each([0, -1, 1.5, 201, Number.NaN])("rejects topK=%s", async (topK) => {
      const { store } = makeStore();

      await expect(store.similaritySearch(VECTOR, topK)).rejects.toThrow(
        InvalidInputError,
      );
    });

    it("accepts the boundary values", async () => {
      const { store } = makeStore();

      await expect(store.similaritySearch(VECTOR, 1)).resolves.toEqual([]);
      await expect(store.similaritySearch(VECTOR, 200)).resolves.toEqual([]);
    });
  });

  /**
   * Regression: Postgres evaluates window functions before ORDER BY and LIMIT,
   * so `LIMIT n` on a CTE with no ORDER BY truncates an unordered set. The
   * lexical half of the fusion computed correct ranks and then kept an
   * arbitrary slice of them, silently dropping the true top matches.
   */
  describe("hybrid candidate selection", () => {
    /** The executable statement: comments stripped, whitespace collapsed. */
    const statementOf = (sql: Prisma.Sql) =>
      sql.strings
        .join("?")
        .replace(/--[^\n]*/g, "")
        .replace(/\s+/g, " ");

    it("orders every candidate CTE before truncating it", async () => {
      const { store, captured } = makeStore();

      await store.hybridSearch(VECTOR, "immortalis pgvector", 5);

      const ctes = statementOf(captured[0])
        .split(/\bAS \(/)
        .slice(1, 3);

      expect(ctes).toHaveLength(2);
      for (const cte of ctes) {
        expect(cte.slice(0, cte.indexOf("LIMIT"))).toContain("ORDER BY");
      }
    });

    it("ranks the keyword CTE by its computed rank", async () => {
      const { store, captured } = makeStore();

      await store.hybridSearch(VECTOR, "immortalis", 5);

      const sql = statementOf(captured[0]);
      const keyword = sql.slice(sql.indexOf("keyword_hits"));

      expect(keyword.slice(0, keyword.indexOf("LIMIT"))).toMatch(
        /ORDER BY rnk\s*$/,
      );
    });
  });

  describe("result mapping", () => {
    it("maps rows and coerces the score to a number", async () => {
      const { store } = makeStore([
        {
          id: "c1",
          documentId: "d1",
          content: "text",
          title: "Title",
          source: "GITHUB",
          docType: "README",
          tags: ["ai"],
          // Postgres numerics arrive as strings via the raw driver.
          score: "0.87",
        },
      ]);

      const [chunk] = await store.similaritySearch(VECTOR, 5);

      expect(chunk.score).toBe(0.87);
      expect(typeof chunk.score).toBe("number");
      expect(chunk.tags).toEqual(["ai"]);
    });

    it("defaults null tags to an empty array", async () => {
      const { store } = makeStore([
        {
          id: "c1",
          documentId: "d1",
          content: "text",
          title: "T",
          source: "GITHUB",
          docType: "README",
          tags: null,
          score: 0.5,
        },
      ]);

      expect((await store.similaritySearch(VECTOR, 5))[0].tags).toEqual([]);
    });
  });

  describe("batch writes", () => {
    it("writes a whole batch in a single statement", async () => {
      const { store, prisma } = makeStore();

      await store.saveEmbeddings([
        { chunkId: "a", embedding: VECTOR },
        { chunkId: "b", embedding: VECTOR },
        { chunkId: "c", embedding: VECTOR },
      ]);

      // One round trip, not one per chunk.
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it("is a no-op for an empty batch", async () => {
      const { store, prisma } = makeStore();

      await store.saveEmbeddings([]);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe("failure translation", () => {
    it("reports a driver failure as a dependency outage", async () => {
      const { store, prisma } = makeStore();
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(
        new Error("connection terminated unexpectedly"),
      );

      await expect(store.similaritySearch(VECTOR, 5)).rejects.toThrow(
        DependencyUnavailableError,
      );
    });

    it("does not disguise a validation error as an outage", async () => {
      const { store } = makeStore();

      await expect(store.similaritySearch([0.1], 5)).rejects.toThrow(
        InvalidInputError,
      );
    });
  });
});
