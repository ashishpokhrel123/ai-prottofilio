import { createHash } from "node:crypto";
import request from "supertest";
import { PasswordHasher } from "../src/modules/auth/password.hasher";
import {
  createPrismaMock,
  createTestApp,
  databaseDownError,
  type PrismaMock,
  type TestContext,
} from "./helpers/create-test-app";

/**
 * End-to-end admin authentication.
 *
 * Exercises the full cycle against the real guards, JWT strategy and argon2
 * verifier: sign in, carry the token to a protected route, and confirm every
 * rejection path returns the right status rather than a 500.
 */

const V1 = "/api/v1";
const EMAIL = "admin@example.com";
const PASSWORD = "a-real-admin-password";

interface SeededUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
}

async function seedAdmin(
  overrides: Partial<SeededUser> = {},
): Promise<SeededUser> {
  return {
    id: "user-1",
    email: EMAIL,
    password: await new PasswordHasher().hash(PASSWORD),
    name: "Admin",
    role: "ADMIN",
    ...overrides,
  };
}

/** Prisma stand-in whose `user` table contains exactly this one admin. */
function prismaWithUser(user: SeededUser | null): PrismaMock {
  return createPrismaMock({
    user: {
      findUnique: jest.fn(({ where }: { where: { email: string } }) =>
        Promise.resolve(user && where.email === user.email ? user : null),
      ),
      update: jest.fn().mockResolvedValue(user),
    },
  });
}

/**
 * Login is throttled to 5 attempts a minute and the throttler's storage lives
 * with the app instance, so each block that makes several attempts gets its
 * own app. Sharing one would make tests fail on a 429 from a *previous* test.
 */
describe("Admin authentication (e2e)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp({ prisma: prismaWithUser(await seedAdmin()) });
  });

  afterEach(() => ctx.close());

  const login = (email: string, password: string) =>
    request(ctx.app.getHttpServer())
      .post(`${V1}/auth/login`)
      .send({ email, password });

  describe("successful sign-in", () => {
    it("returns a token and the user without the password hash", async () => {
      const res = await login(EMAIL, PASSWORD);

      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe("string");
      expect(res.body.user).toMatchObject({ email: EMAIL, role: "ADMIN" });
      expect(JSON.stringify(res.body)).not.toContain("$argon2");
    });

    it("accepts a differently-cased email", async () => {
      const res = await login("  ADMIN@Example.COM  ", PASSWORD);
      expect(res.status).toBe(200);
    });

    /** The whole point of logging in: the token must open the admin routes. */
    it("issues a token that unlocks protected endpoints", async () => {
      const { body } = await login(EMAIL, PASSWORD);
      const token = body.accessToken as string;

      const me = await request(ctx.app.getHttpServer())
        .get(`${V1}/auth/me`)
        .set("Authorization", `Bearer ${token}`);

      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ email: EMAIL, role: "ADMIN" });

      const documents = await request(ctx.app.getHttpServer())
        .get(`${V1}/documents`)
        .set("Authorization", `Bearer ${token}`);

      expect(documents.status).toBe(200);
    });
  });

  describe("rejected sign-in", () => {
    it("rejects a wrong password with 401", async () => {
      const res = await login(EMAIL, "definitely-not-the-password");

      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain("$argon2");
    });

    /**
     * The unseeded-database case: the account simply doesn't exist. The
     * response must be indistinguishable from a wrong password, or it becomes
     * an account-enumeration oracle.
     */
    it("gives an unknown user the same response as a wrong password", async () => {
      const unknown = await login("nobody@example.com", PASSWORD);
      const wrong = await login(EMAIL, "definitely-not-the-password");

      expect(unknown.status).toBe(wrong.status);
      expect(unknown.body.message).toBe(wrong.body.message);
    });

    it("rejects malformed credentials with 400 before touching the database", async () => {
      const bodies = [
        { email: "not-an-email", password: PASSWORD },
        { email: EMAIL, password: "short" },
        { email: EMAIL },
        {},
      ];

      for (const body of bodies) {
        const res = await request(ctx.app.getHttpServer())
          .post(`${V1}/auth/login`)
          .send(body);

        expect(res.status).toBe(400);
      }
    });
  });

  describe("token validation", () => {
    it.each([
      ["a garbage token", "not-a-jwt"],
      ["an empty bearer", ""],
      // Correctly structured but signed with a different key.
      [
        "a foreign signature",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwicm9sZSI6IkFETUlOIn0.wrong-signature",
      ],
    ])("rejects %s with 401", async (_label, token) => {
      const res = await request(ctx.app.getHttpServer())
        .get(`${V1}/auth/me`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    it("rejects a token passed without the Bearer scheme", async () => {
      const { body } = await login(EMAIL, PASSWORD);

      const res = await request(ctx.app.getHttpServer())
        .get(`${V1}/auth/me`)
        .set("Authorization", body.accessToken as string);

      expect(res.status).toBe(401);
    });
  });
});

describe("Admin authentication (e2e) — legacy password migration", () => {
  let ctx: TestContext;
  let prisma: PrismaMock;

  beforeAll(async () => {
    const legacy = await seedAdmin({
      password: createHash("sha256").update(PASSWORD).digest("hex"),
    });
    prisma = prismaWithUser(legacy);
    ctx = await createTestApp({ prisma });
  });

  afterAll(() => ctx.close());

  it("accepts a pre-argon2 password and upgrades the stored hash", async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`${V1}/auth/login`)
      .send({ email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);

    // Migrated in place on successful login — no password reset required.
    const update = (prisma.user as { update: jest.Mock }).update;
    expect(update).toHaveBeenCalled();

    const stored = update.mock.calls[0][0].data.password as string;
    expect(stored.startsWith("$argon2id$")).toBe(true);
  });
});

describe("Admin authentication (e2e) — brute-force protection", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ prisma: prismaWithUser(await seedAdmin()) });
  });

  afterAll(() => ctx.close());

  /**
   * Login is the one endpoint where an attacker gets unlimited guesses at a
   * secret, so it is throttled far harder than the global default.
   */
  it("locks out after repeated failures and says so clearly", async () => {
    const attempt = () =>
      request(ctx.app.getHttpServer())
        .post(`${V1}/auth/login`)
        .send({ email: EMAIL, password: "wrong-password-guess" });

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await attempt()).status);

    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(5);
    expect(statuses).toContain(429);
  });
});

describe("Admin authentication (e2e) — database unavailable", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({
      prisma: createPrismaMock({
        user: {
          findUnique: jest.fn().mockRejectedValue(databaseDownError()),
          update: jest.fn(),
        },
      }),
    });
  });

  afterAll(() => ctx.close());

  it("reports 503, not 401 — the credentials were never checked", async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`${V1}/auth/login`)
      .send({ email: EMAIL, password: PASSWORD });

    // Returning 401 here would send the admin hunting for a typo in a
    // password that was never actually verified.
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("DEPENDENCY_UNAVAILABLE");
  });
});
