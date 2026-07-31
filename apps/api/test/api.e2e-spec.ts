import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import {
  createPrismaMock,
  createTestApp,
  databaseDownError,
  type PrismaMock,
  type TestContext,
} from "./helpers/create-test-app";

/**
 * End-to-end HTTP contract tests.
 *
 * These encode the behaviour verified by hand against a running server:
 * every admin route rejects anonymous callers, malformed payloads are refused
 * before reaching a service, a database outage reports 503 rather than 500,
 * and the chat endpoint streams well-formed SSE.
 */

const V1 = "/api/v1";

describe("API (e2e)", () => {
  let ctx: TestContext;
  let app: INestApplication;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterAll(() => ctx.close());

  describe("health", () => {
    it("liveness returns 200 without touching a dependency", async () => {
      const res = await request(app.getHttpServer()).get(`${V1}/health`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "ok" });
    });

    it("readiness reports each dependency by name", async () => {
      const res = await request(app.getHttpServer()).get(`${V1}/health/ready`);

      expect(res.status).toBe(200);
      expect(res.body.checks).toHaveProperty("database");
      expect(res.body.checks).toHaveProperty("llm");
      expect(res.body.checks).toHaveProperty("queue");
    });
  });

  describe("authentication", () => {
    // Regression: the guard used to be bypassed whenever NODE_ENV was not
    // exactly "production", leaving every one of these open by default.
    it.each<["get" | "post", string]>([
      ["get", "/analytics"],
      ["get", "/documents"],
      ["post", "/embeddings/index"],
      ["post", "/github/sync"],
      ["post", "/skills/extract"],
    ])("rejects anonymous %s %s with 401", async (method, path) => {
      const agent = request(app.getHttpServer());
      const res = await (method === "get"
        ? agent.get(`${V1}${path}`)
        : agent.post(`${V1}${path}`).send({}));

      expect(res.status).toBe(401);
    });

    it("rejects a malformed bearer token", async () => {
      const res = await request(app.getHttpServer())
        .get(`${V1}/documents`)
        .set("Authorization", "Bearer not-a-real-jwt");

      expect(res.status).toBe(401);
    });

    it("returns 400, not 500, for a malformed login body", async () => {
      const res = await request(app.getHttpServer())
        .post(`${V1}/auth/login`)
        .send({ email: "not-an-email", password: "short" });

      expect(res.status).toBe(400);
    });
  });

  describe("request validation", () => {
    it.each([
      ["an empty body", {}],
      ["a blank message", { message: "   " }],
      ["a non-UUID visitorId", { message: "hi", visitorId: "nope" }],
      ["an unexpected field", { message: "hi", unexpected: true }],
      ["an over-long message", { message: "x".repeat(4001) }],
    ])("rejects chat with %s", async (_label, body) => {
      const res = await request(app.getHttpServer())
        .post(`${V1}/chat`)
        .send(body);

      expect(res.status).toBe(400);
    });

    it("rejects an unknown analytics event type", async () => {
      // This endpoint is public, so the allow-list is the only thing stopping
      // a scraper writing arbitrary rows.
      const res = await request(app.getHttpServer())
        .post(`${V1}/analytics/event`)
        .send({ type: "arbitrary-injected-type" });

      expect(res.status).toBe(400);
    });

    it("accepts a known analytics event type", async () => {
      const res = await request(app.getHttpServer())
        .post(`${V1}/analytics/event`)
        .send({ type: "visit" });

      expect(res.status).toBe(202);
    });

    it("rejects a non-UUID document id", async () => {
      const res = await request(app.getHttpServer())
        .post(`${V1}/documents/not-a-uuid/reindex`)
        .set("Authorization", "Bearer x");

      // Unauthorised or bad-request are both acceptable; a 500 is not.
      expect([400, 401]).toContain(res.status);
    });
  });

  describe("routing", () => {
    it("404s an unknown route", async () => {
      const res = await request(app.getHttpServer()).get(
        `${V1}/does-not-exist`,
      );
      expect(res.status).toBe(404);
    });

    it("requires the version prefix", async () => {
      const res = await request(app.getHttpServer()).get("/api/health");
      expect(res.status).toBe(404);
    });
  });

  describe("public endpoints", () => {
    it("serves projects", async () => {
      const res = await request(app.getHttpServer()).get(`${V1}/projects`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("serves skills grouped by category", async () => {
      const res = await request(app.getHttpServer()).get(`${V1}/skills`);

      expect(res.status).toBe(200);
      expect(typeof res.body).toBe("object");
    });
  });

  describe("chat streaming", () => {
    it("streams well-formed SSE with a conversation id and a done event", async () => {
      const res = await request(app.getHttpServer())
        .post(`${V1}/chat`)
        .send({ message: "What have you built?" });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/event-stream");
      // Buffering proxies would otherwise hold the whole stream back.
      expect(res.headers["x-accel-buffering"]).toBe("no");

      const events = res.text
        .split("\n\n")
        .filter((block) => block.startsWith("data:"))
        .map((block) => block.replace(/^data:\s?/, "").trim());

      expect(events[events.length - 1]).toBe("[DONE]");

      const parsed = events
        .filter((e) => e !== "[DONE]")
        .map((e) => JSON.parse(e) as { type: string; conversationId?: string });

      expect(parsed[0]).toMatchObject({ type: "token" });
      expect(parsed[0].conversationId).toBeTruthy();
      expect(parsed.some((e) => e.type === "done")).toBe(true);
    });
  });

  describe("security headers", () => {
    it("sets hardening headers and hides the framework", async () => {
      const res = await request(app.getHttpServer()).get(`${V1}/health`);

      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers).toHaveProperty("x-frame-options");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("allows a configured origin", async () => {
      const res = await request(app.getHttpServer())
        .get(`${V1}/health`)
        .set("Origin", "http://localhost:3000");

      expect(res.headers["access-control-allow-origin"]).toBe(
        "http://localhost:3000",
      );
    });

    it("does not echo an unlisted origin", async () => {
      const res = await request(app.getHttpServer())
        .get(`${V1}/health`)
        .set("Origin", "https://evil.example");

      expect(res.headers["access-control-allow-origin"]).not.toBe(
        "https://evil.example",
      );
    });
  });
});

/**
 * Regression: a database outage used to surface as 500 INTERNAL_ERROR, which
 * says "this request is broken" rather than "this dependency is down" — not
 * retryable, and useless to a load balancer.
 */
describe("API (e2e) — database unavailable", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    const failing = (): PrismaMock => {
      const reject = () => jest.fn().mockRejectedValue(databaseDownError());
      const model = {
        findMany: reject(),
        findUnique: reject(),
        findFirst: reject(),
        create: reject(),
        count: reject(),
      };
      return createPrismaMock({
        project: model,
        skill: model,
        user: model,
        ping: jest.fn().mockResolvedValue(false),
      });
    };

    ctx = await createTestApp({ prisma: failing() });
  });

  afterAll(() => ctx.close());

  it.each(["/projects", "/skills"])("reports 503 for %s", async (path) => {
    const res = await request(ctx.app.getHttpServer()).get(`${V1}${path}`);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("never leaks the underlying database error to the client", async () => {
    const res = await request(ctx.app.getHttpServer()).get(`${V1}/projects`);

    expect(JSON.stringify(res.body)).not.toMatch(/prisma|postgres:\/\/|stack/i);
  });

  it("reports readiness as degraded with the database down", async () => {
    const res = await request(ctx.app.getHttpServer()).get(
      `${V1}/health/ready`,
    );

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.checks.database.status).toBe("down");
  });

  it("keeps liveness green — the process itself is fine", async () => {
    const res = await request(ctx.app.getHttpServer()).get(`${V1}/health`);
    expect(res.status).toBe(200);
  });
});
