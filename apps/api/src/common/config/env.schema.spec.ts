import { EnvValidationError, parseEnv } from "./env.schema";
import { buildConfig } from "./configuration";

/** A minimal environment that passes validation, for tests to override. */
const baseEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  JWT_SECRET: "a".repeat(48),
} satisfies NodeJS.ProcessEnv;

describe("parseEnv", () => {
  it("applies documented defaults", () => {
    const env = parseEnv({ ...baseEnv });

    expect(env.NODE_ENV).toBe("development");
    expect(env.API_PORT).toBe(4000);
    expect(env.RAG_TOP_K).toBe(8);
    expect(env.AUTH_DEV_BYPASS).toBe(false);
  });

  it("coerces numeric strings", () => {
    const env = parseEnv({ ...baseEnv, API_PORT: "8080", RAG_TOP_K: "12" });

    expect(env.API_PORT).toBe(8080);
    expect(env.RAG_TOP_K).toBe(12);
  });

  it("parses comma-separated CORS origins", () => {
    const env = parseEnv({
      ...baseEnv,
      CORS_ORIGINS: "https://a.dev, https://b.dev ,",
    });

    expect(env.CORS_ORIGINS).toEqual(["https://a.dev", "https://b.dev"]);
  });

  describe("required values", () => {
    it("rejects a missing DATABASE_URL", () => {
      const { DATABASE_URL: _omitted, ...rest } = baseEnv;
      expect(() => parseEnv(rest)).toThrow(EnvValidationError);
    });

    it("rejects a non-postgres DATABASE_URL", () => {
      expect(() =>
        parseEnv({ ...baseEnv, DATABASE_URL: "mysql://localhost/db" }),
      ).toThrow(EnvValidationError);
    });

    it("rejects a missing JWT_SECRET", () => {
      const { JWT_SECRET: _omitted, ...rest } = baseEnv;
      expect(() => parseEnv(rest)).toThrow(EnvValidationError);
    });
  });

  describe("production guardrails", () => {
    it("rejects a short JWT_SECRET", () => {
      expect(() =>
        parseEnv({ ...baseEnv, NODE_ENV: "production", JWT_SECRET: "short" }),
      ).toThrow(/at least 32 characters/);
    });

    it("rejects a placeholder JWT_SECRET", () => {
      expect(() =>
        parseEnv({
          ...baseEnv,
          NODE_ENV: "production",
          JWT_SECRET: "change-me-in-production-super-secret-value",
        }),
      ).toThrow(/placeholder/);
    });

    it("refuses to enable the auth bypass", () => {
      expect(() =>
        parseEnv({
          ...baseEnv,
          NODE_ENV: "production",
          AUTH_DEV_BYPASS: "true",
        }),
      ).toThrow(/cannot be enabled in production/);
    });

    it("allows the bypass outside production", () => {
      expect(
        parseEnv({ ...baseEnv, AUTH_DEV_BYPASS: "true" }).AUTH_DEV_BYPASS,
      ).toBe(true);
    });
  });

  describe("cross-field RAG constraints", () => {
    it("rejects rerankTopN larger than topK", () => {
      expect(() =>
        parseEnv({ ...baseEnv, RAG_TOP_K: "4", RAG_RERANK_TOP_N: "8" }),
      ).toThrow(/cannot exceed RAG_TOP_K/);
    });

    it("rejects overlap larger than chunk size", () => {
      expect(() =>
        parseEnv({
          ...baseEnv,
          RAG_CHUNK_SIZE: "200",
          RAG_CHUNK_OVERLAP: "400",
        }),
      ).toThrow(/smaller than RAG_CHUNK_SIZE/);
    });
  });

  it("reports every field problem at once, not just the first", () => {
    try {
      // Two independent field failures — both must appear, so one broken
      // deploy surfaces its full fix list rather than one error per restart.
      parseEnv({ DATABASE_URL: "mysql://localhost/db", API_PORT: "-1" });
      throw new Error("expected validation to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);

      const issues = (err as EnvValidationError).issues;
      expect(issues.length).toBeGreaterThan(1);
      expect(issues.map((i) => i.path.join("."))).toEqual(
        expect.arrayContaining(["DATABASE_URL", "API_PORT", "JWT_SECRET"]),
      );
    }
  });
});

describe("buildConfig", () => {
  it("treats placeholder Gemini keys as unconfigured", () => {
    expect(
      buildConfig(
        parseEnv({ ...baseEnv, GEMINI_API_KEY: "your-gemini-api-key" }),
      ).gemini.isConfigured,
    ).toBe(false);

    expect(buildConfig(parseEnv(baseEnv)).gemini.isConfigured).toBe(false);

    expect(
      buildConfig(parseEnv({ ...baseEnv, GEMINI_API_KEY: "AIza-real-key" }))
        .gemini.isConfigured,
    ).toBe(true);
  });

  it("returns null redis config when REDIS_URL is absent", () => {
    expect(buildConfig(parseEnv(baseEnv)).redis).toBeNull();

    expect(
      buildConfig(parseEnv({ ...baseEnv, REDIS_URL: "redis://localhost:6379" }))
        .redis,
    ).toEqual({ url: "redis://localhost:6379" });
  });

  // A hosting dashboard variable that exists but is empty used to crash the
  // app at boot with "REDIS_URL: Invalid url", on a variable documented as
  // optional. Blank means absent.
  it.each(["", "   "])(
    "treats a blank REDIS_URL (%p) as unset rather than invalid",
    (blank) => {
      expect(
        buildConfig(parseEnv({ ...baseEnv, REDIS_URL: blank })).redis,
      ).toBe(null);
    },
  );

  it("rejects a REDIS_URL that is a URL but not a redis connection string", () => {
    expect(() =>
      parseEnv({ ...baseEnv, REDIS_URL: "https://eu1-foo.upstash.io" }),
    ).toThrow(/redis:\/\/ or rediss:\/\//);
  });

  it("accepts a TLS rediss:// URL", () => {
    expect(
      buildConfig(
        parseEnv({ ...baseEnv, REDIS_URL: "rediss://default:pw@host:6379" }),
      ).redis,
    ).toEqual({ url: "rediss://default:pw@host:6379" });
  });

  it("always includes APP_URL in the CORS allow-list", () => {
    const config = buildConfig(
      parseEnv({
        ...baseEnv,
        APP_URL: "https://portfolio.dev",
        CORS_ORIGINS: "https://preview.dev",
      }),
    );

    expect(config.corsOrigins).toEqual([
      "https://portfolio.dev",
      "https://preview.dev",
    ]);
  });

  it("converts rate-limit windows to milliseconds", () => {
    const config = buildConfig(parseEnv({ ...baseEnv, RATE_LIMIT_TTL: "30" }));
    expect(config.rateLimit.default.ttlMs).toBe(30_000);
  });
});
