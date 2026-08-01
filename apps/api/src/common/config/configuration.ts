import type { Env } from "./env.schema";

/**
 * Maps the flat, validated environment into a nested, domain-shaped config
 * object. Consumers inject `AppConfigService` and read typed sections — they
 * never see raw env var names, so renaming a variable is a one-line change.
 */
export interface AppConfig {
  readonly nodeEnv: Env["NODE_ENV"];
  readonly isProduction: boolean;
  readonly isTest: boolean;
  /**
   * True when running as a Vercel Function rather than a long-lived process.
   *
   * Changes two bindings in the composition root: the filesystem is read-only
   * apart from `/tmp` (which is wiped between invocations), and there is no
   * process to consume a queue, so the ingestion path is bound to adapters
   * that refuse loudly instead of failing halfway through.
   */
  readonly isServerless: boolean;
  readonly port: number;
  readonly appUrl: string;
  readonly corsOrigins: readonly string[];
  readonly logLevel: Env["LOG_LEVEL"];

  readonly database: { readonly url: string };

  /** `null` when no Redis is configured — ingestion then runs inline. */
  readonly redis: { readonly url: string } | null;

  readonly auth: {
    readonly jwtSecret: string;
    readonly jwtExpiresIn: string;
    readonly devBypass: boolean;
  };

  readonly gemini: {
    readonly apiKey: string;
    readonly llmModel: string;
    readonly embeddingModel: string;
    readonly dimensions: number;
    /** False when the key is missing or still the documented placeholder. */
    readonly isConfigured: boolean;
  };

  readonly rag: {
    readonly topK: number;
    readonly rerankTopN: number;
    readonly chunkSize: number;
    readonly chunkOverlap: number;
    readonly minSimilarity: number;
  };

  readonly github: { readonly token: string; readonly username: string };

  readonly uploads: { readonly dir: string; readonly maxBytes: number };

  readonly rateLimit: {
    readonly default: { readonly ttlMs: number; readonly limit: number };
    readonly chat: { readonly ttlMs: number; readonly limit: number };
  };
}

const PLACEHOLDER_KEYS = new Set(["your-gemini-api-key", "changeme", "todo"]);

/**
 * Turns a raw `REDIS_URL` into a config section, or `null` to run inline.
 *
 * Never throws. Redis is optional, and a bad value for an optional dependency
 * should degrade the app, not stop it — the ingestion queue falls back to
 * in-process execution and everything else is unaffected.
 *
 * It does complain loudly, because the alternative failure is silent: someone
 * who *meant* to configure Redis would otherwise see "queue=inline" and no
 * explanation.
 */
export function resolveRedisUrl(raw: string | undefined): {
  readonly url: string;
} | null {
  const value = raw?.trim();

  // Absent, or present-but-empty. Hosting dashboards make it far easier to
  // blank a variable than to delete it; both mean the same thing.
  if (!value) return null;

  const isRedisScheme =
    value.startsWith("redis://") || value.startsWith("rediss://");

  if (!isRedisScheme) {
    warn(
      `REDIS_URL is set but is not a redis:// or rediss:// connection string, so it ` +
        `has been ignored and ingestion will run in-process. ` +
        `Upstash's REST URL and token are a different API and will not work here — ` +
        `use the connection string labelled "redis://" or "rediss://". ` +
        `To silence this, remove REDIS_URL, or disconnect the store if a marketplace ` +
        `integration is injecting it.`,
    );
    return null;
  }

  try {
    new URL(value);
  } catch {
    warn(
      "REDIS_URL has a redis:// scheme but is not a parseable URL, so it has been " +
        "ignored and ingestion will run in-process.",
    );
    return null;
  }

  return Object.freeze({ url: value });
}

/** Runs before the pino logger exists, so this is deliberately console-based. */
function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[config] ${message}`);
}

/**
 * Reduces a configured URL to a bare origin, so CORS comparisons succeed.
 *
 * A browser's `Origin` header is always exactly `scheme://host[:port]` — never
 * a trailing slash, never a path. `cors` compares it by string equality, so
 * `APP_URL=https://example.com/` allows nothing at all: the deploy looks
 * correctly configured and every request is still blocked, with the browser
 * reporting only that the origin is not allowed.
 *
 * Returns `""` for an unparseable value, which the caller filters out.
 */
function toOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    warn(`Ignoring "${value}" in the CORS allow-list: not a valid URL.`);
    return "";
  }
}

export function buildConfig(env: Env): AppConfig {
  const apiKey = env.GEMINI_API_KEY.trim();
  const isServerless = env.VERCEL === "1";

  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    isTest: env.NODE_ENV === "test",
    isServerless,
    // A host-assigned PORT is not a preference, it's a contract: bind the
    // wrong one and the platform's health check never succeeds.
    port: env.PORT ?? env.API_PORT,
    appUrl: env.APP_URL,
    corsOrigins: Object.freeze(
      Array.from(
        new Set([env.APP_URL, ...env.CORS_ORIGINS].map(toOrigin)),
      ).filter(Boolean),
    ),
    logLevel: env.LOG_LEVEL,

    database: Object.freeze({ url: env.DATABASE_URL }),

    redis: resolveRedisUrl(env.REDIS_URL),

    auth: Object.freeze({
      jwtSecret: env.JWT_SECRET,
      jwtExpiresIn: env.JWT_EXPIRES_IN,
      devBypass: env.AUTH_DEV_BYPASS,
    }),

    gemini: Object.freeze({
      apiKey,
      llmModel: env.GEMINI_LLM_MODEL,
      embeddingModel: env.GEMINI_EMBEDDING_MODEL,
      dimensions: env.EMBEDDING_DIMENSIONS,
      isConfigured: apiKey.length > 0 && !PLACEHOLDER_KEYS.has(apiKey),
    }),

    rag: Object.freeze({
      topK: env.RAG_TOP_K,
      rerankTopN: env.RAG_RERANK_TOP_N,
      chunkSize: env.RAG_CHUNK_SIZE,
      chunkOverlap: env.RAG_CHUNK_OVERLAP,
      minSimilarity: env.RAG_MIN_SIMILARITY,
    }),

    github: Object.freeze({
      token: env.GITHUB_TOKEN,
      username: env.GITHUB_USERNAME,
    }),

    uploads: Object.freeze({
      // `/tmp` is the only writable path in a Function. Nothing should reach
      // the disk there — `UnavailableFileStorage` is bound instead — but a
      // default of `./uploads` would turn any stray write into an EROFS crash
      // rather than the 503 the storage adapter raises.
      dir: isServerless ? "/tmp/uploads" : env.UPLOAD_DIR,
      maxBytes: env.MAX_UPLOAD_BYTES,
    }),

    rateLimit: Object.freeze({
      default: Object.freeze({
        ttlMs: env.RATE_LIMIT_TTL * 1000,
        limit: env.RATE_LIMIT_MAX,
      }),
      chat: Object.freeze({
        ttlMs: env.CHAT_RATE_LIMIT_TTL * 1000,
        limit: env.CHAT_RATE_LIMIT_MAX,
      }),
    }),
  });
}
