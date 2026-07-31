import { createHash } from "node:crypto";
import type { JwtService } from "@nestjs/jwt";
import { AuthenticationError } from "../../core/errors/domain.errors";
import type { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { AuthService } from "./auth.service";
import { PasswordHasher } from "./password.hasher";

// Argon2 is intentionally slow; the 5s default is too tight for a suite of them.
jest.setTimeout(30_000);

const PASSWORD = "correct-horse-battery";
const EMAIL = "admin@example.com";

interface StoredUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
}

function makeService(user: StoredUser | null) {
  const updates: { id: string; password: string }[] = [];

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn(({ where, data }) => {
        updates.push({ id: where.id, password: data.password });
        return Promise.resolve(user);
      }),
    },
  } as unknown as PrismaService;

  const jwt = {
    signAsync: jest.fn().mockResolvedValue("signed.jwt.token"),
  } as unknown as JwtService;

  return {
    service: new AuthService(prisma, jwt, new PasswordHasher()),
    prisma,
    jwt,
    updates,
  };
}

async function seededUser(
  password: string,
  overrides: Partial<StoredUser> = {},
): Promise<StoredUser> {
  return {
    id: "user-1",
    email: EMAIL,
    password: await new PasswordHasher().hash(password),
    name: "Admin",
    role: "ADMIN",
    ...overrides,
  };
}

describe("AuthService", () => {
  describe("successful login", () => {
    it("returns a token and the user, never the password hash", async () => {
      const { service, jwt } = makeService(await seededUser(PASSWORD));

      const result = await service.login(EMAIL, PASSWORD);

      expect(result.accessToken).toBe("signed.jwt.token");
      expect(result.user).toEqual({
        id: "user-1",
        email: EMAIL,
        name: "Admin",
        role: "ADMIN",
      });
      expect(JSON.stringify(result)).not.toContain("$argon2");
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: "user-1",
        email: EMAIL,
        role: "ADMIN",
      });
    });

    it("looks the user up by normalised email", async () => {
      const { service, prisma } = makeService(await seededUser(PASSWORD));

      await service.login("  ADMIN@Example.COM  ", PASSWORD);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: EMAIL },
      });
    });
  });

  describe("rejected login", () => {
    it("rejects a wrong password", async () => {
      const { service } = makeService(await seededUser(PASSWORD));

      await expect(service.login(EMAIL, "wrong-password")).rejects.toThrow(
        AuthenticationError,
      );
    });

    /**
     * This is the case an unseeded database hits: no admin row exists, so
     * every login attempt fails regardless of the password being correct.
     */
    it("rejects an unknown user with the same error as a wrong password", async () => {
      const { service } = makeService(null);

      const unknownUser = await service
        .login("nobody@example.com", PASSWORD)
        .catch((e: Error) => e.message);

      const wrongPassword = await makeService(await seededUser(PASSWORD))
        .service.login(EMAIL, "wrong-password")
        .catch((e: Error) => e.message);

      // Identical messages: the response must not reveal which accounts exist.
      expect(unknownUser).toBe(wrongPassword);
    });

    it("does not short-circuit for an unknown user (timing defence)", async () => {
      const { service } = makeService(null);

      const start = Date.now();
      await service.login("nobody@example.com", PASSWORD).catch(() => null);

      // Verifying the dummy hash costs real work rather than returning
      // instantly, which would make account enumeration trivial.
      expect(Date.now() - start).toBeGreaterThan(5);
    });
  });

  describe("legacy password migration", () => {
    const legacyHash = (p: string) =>
      createHash("sha256").update(p).digest("hex");

    it("accepts a legacy SHA-256 hash and upgrades it to argon2id", async () => {
      const { service, updates } = makeService(
        await seededUser(PASSWORD, { password: legacyHash(PASSWORD) }),
      );

      const result = await service.login(EMAIL, PASSWORD);

      expect(result.accessToken).toBe("signed.jwt.token");
      expect(updates).toHaveLength(1);
      expect(updates[0].password.startsWith("$argon2id$")).toBe(true);
    });

    it("does not upgrade on a failed legacy login", async () => {
      const { service, updates } = makeService(
        await seededUser(PASSWORD, { password: legacyHash(PASSWORD) }),
      );

      await service.login(EMAIL, "wrong").catch(() => null);

      expect(updates).toHaveLength(0);
    });
  });
});
