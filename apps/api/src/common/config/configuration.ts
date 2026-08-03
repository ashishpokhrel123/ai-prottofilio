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

  /** Which adapter the composition root binds to the LLM/embedding ports. */
  readonly llmProvider: Env["LLM_PROVIDER"];

  readonly gemini: {
    readonly apiKey: string;
    readonly llmModel: string;
    readonly embeddingModel: string;
    readonly dimensions: number;
    /** False when the key is missing or still the documented placeholder. */
    readonly isConfigured: boolean;
  };

  readonly nvidia: {
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly llmModel: string;
    readonly embeddingModel: string;
    readonly rerankBaseUrl: string;
    readonly rerankModel: string;
    /** Path appended to `rerankBaseUrl`. Derived from the model id by default. */
    readonly rerankPath: string;
    readonly dimensions: number;
    readonly isConfigured: boolean;
  };

  readonly rag: {
    readonly topK: number;
    readonly rerankTopN: number;
    readonly chunkSize: number;
    readonly chunkOverlap: number;
    readonly minSimilarity: number;
    readonly rerankProvider: Env["RAG_RERANK_PROVIDER"];
  };

  readonly github: { readonly token: string; readonly username: string };

  readonly uploads: { readonly dir: string; readonly maxBytes: number };

  readonly rateLimit: {
    readonly default: { readonly ttlMs: number; readonly limit: number };
    readonly chat: { readonly ttlMs: number; readonly limit: number };
  };
}

/**
 * Reranking is served from a different host than chat and embeddings.
 *
 * `integrate.api.nvidia.com` is the OpenAI-compatible surface. Ranking has no
 * OpenAI equivalent, is not served there, and does not appear in that host's
 * `/v1/models` — so pointing re-ranking at it returns a bare `404 page not
 * found`, which reads like a wrong path rather than a wrong host and sends you
 * hunting through request bodies.
 *
 * Self-hosting collapses the distinction: one NIM container serves whatever it
 * was started with, and both base URLs become the same address.
 */
const NVIDIA_RERANK_DEFAULT = "https://ai.api.nvidia.com/v1";

/**
 * Builds the reranking path for a model id.
 *
 * NVIDIA serves ranking under a per-model path rather than one shared route:
 *
 *   /v1/retrieval/{org}/{model}/reranking
 *
 * with one trap — dots in the model id become underscores in the URL while the
 * `model` field in the request body keeps its dots. So
 * `nvidia/llama-3.2-nv-rerankqa-1b-v2` is served at
 * `.../retrieval/nvidia/llama-3_2-nv-rerankqa-1b-v2/reranking`.
 *
 * Some older NIMs answer on a flat `/ranking` instead, which is what
 * `NVIDIA_RERANK_PATH` is for — and it is also what a self-hosted container
 * uses, since it serves exactly one model and needs no path discrimination.
 */
export function nvidiaRerankPath(model: string): string {
  const [org, name] = model.includes("/")
    ? model.split("/", 2)
    : ["nvidia", model];

  return `/retrieval/${org}/${name.replace(/\./g, "_")}/reranking`;
}

const PLACEHOLDER_KEYS = new Set([
  "your-gemini-api-key",
  "your-nvidia-api-key",
  "nvapi-your-key-here",
  "changeme",
  "todo",
]);

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
 * Connections a single process opens against a pooled endpoint.
 *
 * Prisma's default is `num_cpus * 2 + 1` — 21 on a ten-core laptop, and that
 * is *per process*: the API and the ingestion worker each want their own set.
 * Against a shared PgBouncer that is both wasteful and, on Neon's free tier,
 * more than the account is allowed. Ten is comfortably above what a portfolio
 * API needs concurrently and low enough that two processes still fit.
 */
const POOLED_CONNECTION_LIMIT = 10;

/**
 * Makes a pooled Postgres URL safe for Prisma.
 *
 * Neon's `-pooler` endpoint is PgBouncer in *transaction* mode: each statement
 * may land on a different backend. Prisma uses prepared statements by default,
 * and a prepared statement created on one backend does not exist on the next —
 * so queries fail or hang, connections are never returned, and the client-side
 * pool drains. The symptom is maddeningly indirect:
 *
 *   Timed out fetching a new connection from the connection pool
 *   (Current connection pool timeout: 10, connection limit: 21)
 *
 * which reads as "the database is slow" and is actually "this URL is missing a
 * query parameter". `pgbouncer=true` tells Prisma to stop using prepared
 * statements; the connection limit stops one process monopolising the pooler.
 *
 * Only pooled hosts are touched. A direct connection wants neither setting —
 * disabling prepared statements there would cost performance for nothing.
 *
 * Never throws: an unparseable URL is returned unchanged so the failure
 * surfaces as Prisma's own connection error, which names the real problem
 * better than anything this function could say.
 */
export function normalizeDatabaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  // Neon marks pooled endpoints in the hostname. `pgbouncer=true` already
  // present means the operator knows what this is, whatever the host is called.
  const isPooled =
    url.hostname.includes("-pooler.") ||
    url.searchParams.get("pgbouncer") === "true";

  if (!isPooled) return raw;

  const added: string[] = [];

  if (!url.searchParams.has("pgbouncer")) {
    url.searchParams.set("pgbouncer", "true");
    added.push("pgbouncer=true");
  }

  // An explicit limit is the operator's decision and is left alone.
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", String(POOLED_CONNECTION_LIMIT));
    added.push(`connection_limit=${POOLED_CONNECTION_LIMIT}`);
  }

  if (added.length > 0) {
    warn(
      `DATABASE_URL points at a connection pooler but was missing ${added.join(
        " and ",
      )}. Added automatically — without it Prisma exhausts its client-side ` +
        "pool and every query eventually times out. Migrations are unaffected; " +
        "they use DIRECT_URL.",
    );
  }

  return url.toString();
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

/** A key is usable when it is present and not one of the documented stubs. */
function isRealKey(key: string): boolean {
  return key.length > 0 && !PLACEHOLDER_KEYS.has(key);
}

export function buildConfig(env: Env): AppConfig {
  const apiKey = env.GEMINI_API_KEY.trim();
  const nvidiaKey = env.NVIDIA_API_KEY.trim();
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

    database: Object.freeze({ url: normalizeDatabaseUrl(env.DATABASE_URL) }),

    redis: resolveRedisUrl(env.REDIS_URL),

    auth: Object.freeze({
      jwtSecret: env.JWT_SECRET,
      jwtExpiresIn: env.JWT_EXPIRES_IN,
      devBypass: env.AUTH_DEV_BYPASS,
    }),

    llmProvider: env.LLM_PROVIDER,

    gemini: Object.freeze({
      apiKey,
      llmModel: env.GEMINI_LLM_MODEL,
      embeddingModel: env.GEMINI_EMBEDDING_MODEL,
      dimensions: env.EMBEDDING_DIMENSIONS,
      isConfigured: isRealKey(apiKey),
    }),

    nvidia: Object.freeze({
      apiKey: nvidiaKey,
      baseUrl: env.NVIDIA_BASE_URL,
      llmModel: env.NVIDIA_LLM_MODEL,
      embeddingModel: env.NVIDIA_EMBEDDING_MODEL,
      // Deliberately NOT falling back to NVIDIA_BASE_URL. Ranking is served
      // from a different host than the OpenAI-compatible endpoints, and
      // inheriting the chat host silently 404s every re-rank.
      rerankBaseUrl: env.NVIDIA_RERANK_BASE_URL || NVIDIA_RERANK_DEFAULT,
      rerankModel: env.NVIDIA_RERANK_MODEL,
      rerankPath:
        env.NVIDIA_RERANK_PATH || nvidiaRerankPath(env.NVIDIA_RERANK_MODEL),
      // One knob, not two. The vector column has exactly one width, so both
      // adapters must agree on it or the second one to run corrupts the index.
      dimensions: env.EMBEDDING_DIMENSIONS,
      isConfigured: isRealKey(nvidiaKey),
    }),

    rag: Object.freeze({
      topK: env.RAG_TOP_K,
      rerankTopN: env.RAG_RERANK_TOP_N,
      chunkSize: env.RAG_CHUNK_SIZE,
      chunkOverlap: env.RAG_CHUNK_OVERLAP,
      minSimilarity: env.RAG_MIN_SIMILARITY,
      rerankProvider: env.RAG_RERANK_PROVIDER,
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
