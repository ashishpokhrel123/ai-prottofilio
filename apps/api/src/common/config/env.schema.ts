import { z } from "zod";

/**
 * The single source of truth for every environment variable the API reads.
 *
 * Nothing else in the codebase is allowed to touch `process.env` directly.
 * Validation runs once, at boot, and throws a readable aggregate error if the
 * environment is wrong — a misconfigured deploy fails immediately and loudly
 * instead of surfacing as a mysterious 500 on the first request.
 */

const nodeEnv = z
  .enum(["development", "test", "production"])
  .default("development");

const port = z.coerce.number().int().positive().max(65535);

const booleanish = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");

const csv = z
  .string()
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()));

export const envSchema = z
  .object({
    // ---- Runtime ----
    NODE_ENV: nodeEnv,
    API_PORT: port.default(4000),
    /**
     * Assigned by the host, not by us. Vercel, Railway, Render, Fly and Heroku
     * all pick a port and expect the process to bind the one they chose, so it
     * wins over `API_PORT` when present. Unset in Docker and local dev, where
     * `API_PORT` is the knob.
     */
    PORT: port.optional(),
    /**
     * Injected by Vercel (always the string "1"), absent everywhere else.
     * Declared here only so the serverless branch in `buildConfig` obeys the
     * "nothing reads `process.env` directly" rule.
     */
    VERCEL: z.string().optional(),
    /** Public origin of the web app; used for CORS and absolute links. */
    APP_URL: z.string().url().default("http://localhost:3000"),
    /** Extra allowed browser origins (comma-separated). Vercel previews go here. */
    CORS_ORIGINS: csv.default(""),
    // "silent" is a real pino level and the sane default for test runs.
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    // ---- Persistence ----
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required (Postgres with the pgvector extension)")
      .refine(
        (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
        "DATABASE_URL must be a postgres:// or postgresql:// connection string",
      ),

    /**
     * Unpooled endpoint, for DDL.
     *
     * Read by `schema.prisma` (`directUrl`) and by the manual vector-width
     * script, not by the running API — but declared here anyway, because the
     * rule in this file is that nothing touches `process.env` undocumented.
     * It was already load-bearing for migrations while being invisible to
     * anyone reading the config.
     *
     * Optional: a plain Postgres deployment has no separate direct endpoint,
     * and Prisma falls back to `DATABASE_URL` when this is unset.
     */
    DIRECT_URL: z.string().optional(),

    /**
     * Optional. When absent the API runs in "inline ingestion" mode: uploads
     * are processed in-process instead of via a BullMQ worker. That keeps the
     * app deployable on hosts without Redis at the cost of slower uploads.
     */
    /**
     * Deliberately unvalidated here. Redis is optional — the app falls back to
     * inline ingestion without it — so a malformed value must not be fatal.
     *
     * It used to be `z.string().url()`, which killed the process at boot over
     * an optional dependency. That is especially hostile on a platform where
     * a marketplace integration injects the variable for you: the value is not
     * yours to correct, and disconnecting the store is the only way to remove
     * it.
     *
     * `resolveRedisUrl` in `configuration.ts` decides what the value means and
     * warns when it discards one.
     */
    REDIS_URL: z.string().optional(),

    // ---- Auth ----
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    JWT_EXPIRES_IN: z.string().default("7d"),
    /**
     * Escape hatch for local development only. Validated below so it can never
     * be enabled in production, no matter what the deploy environment says.
     */
    AUTH_DEV_BYPASS: booleanish.default(false),

    // ---- Model provider ----
    /**
     * Which adapter is bound to `LLM_PORT` and `EMBEDDING_PORT`.
     *
     * Both at once, deliberately. Splitting them would let generation and
     * embeddings come from different vendors, which sounds flexible and is a
     * trap: the embedding provider alone determines the vector width, and a
     * mismatch surfaces as an insert error deep inside a re-index rather than
     * at boot.
     */
    LLM_PROVIDER: z.enum(["gemini", "nvidia"]).default("gemini"),

    // ---- Gemini ----
    GEMINI_API_KEY: z.string().default(""),
    /**
     * These defaults are the documented fallback *and* the revert target, so
     * they have to name models that currently exist. They previously said
     * `gemini-2.5-pro` / `text-embedding-004` long after the deployment had
     * moved on — harmless while `.env` overrode both, and a broken revert the
     * moment anyone relied on them.
     */
    GEMINI_LLM_MODEL: z.string().default("gemini-3.6-flash"),
    GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),

    // ---- NVIDIA NIM ----
    NVIDIA_API_KEY: z.string().default(""),
    /**
     * OpenAI-compatible base URL. The hosted default is licensed for
     * development and evaluation; point this at a self-hosted NIM or vLLM
     * server (`http://localhost:8000/v1`) for production, with no code change.
     */
    NVIDIA_BASE_URL: z
      .string()
      .url()
      .default("https://integrate.api.nvidia.com/v1"),
    NVIDIA_LLM_MODEL: z.string().default("nvidia/nemotron-3-nano-30b-a3b"),
    NVIDIA_EMBEDDING_MODEL: z.string().default("nvidia/nemotron-3-embed-1b"),
    /**
     * Re-ranking has no OpenAI equivalent and is served from a different host
     * entirely — `ai.api.nvidia.com`, not the `integrate` host that serves
     * chat and embeddings. Empty means "use that default", NOT "reuse
     * NVIDIA_BASE_URL": inheriting the integrate host produces a bare
     * `404 page not found` on every re-rank.
     *
     * Set it explicitly when self-hosting, where a single NIM container
     * usually serves everything from one address.
     */
    NVIDIA_RERANK_BASE_URL: z.string().default(""),
    NVIDIA_RERANK_MODEL: z
      .string()
      .default("nvidia/llama-nemotron-rerank-1b-v2"),
    /**
     * Overrides the reranking path. Empty derives it from the model id as
     * `/retrieval/{org}/{model}/reranking`, which is how the hosted API routes
     * these. Set to `/ranking` for a self-hosted NIM, which serves a single
     * model and needs no per-model path.
     */
    NVIDIA_RERANK_PATH: z.string().default(""),
    /**
     * `lexical` is the local, zero-latency keyword pass. `nvidia` adds a
     * cross-encoder round-trip to every query — better relevance, ~200ms, and
     * one more request against the rate limit.
     */
    RAG_RERANK_PROVIDER: z.enum(["lexical", "nvidia"]).default("lexical"),

    // ---- RAG tuning ----
    RAG_TOP_K: z.coerce.number().int().positive().max(100).default(8),
    RAG_RERANK_TOP_N: z.coerce.number().int().positive().max(100).default(4),
    RAG_CHUNK_SIZE: z.coerce.number().int().min(100).max(4000).default(800),
    RAG_CHUNK_OVERLAP: z.coerce.number().int().min(0).max(1000).default(120),
    RAG_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.35),

    // ---- Integrations ----
    GITHUB_TOKEN: z.string().default(""),
    GITHUB_USERNAME: z.string().default(""),

    // ---- Uploads ----
    UPLOAD_DIR: z.string().default("uploads"),
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(25 * 1024 * 1024),

    // ---- Rate limiting ----
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    CHAT_RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    CHAT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  })
  // A weak signing key in production means anyone can mint an admin token.
  .refine(
    (env) => env.NODE_ENV !== "production" || env.JWT_SECRET.length >= 32,
    {
      path: ["JWT_SECRET"],
      message:
        "JWT_SECRET must be at least 32 characters in production. " +
        "Generate one with: openssl rand -base64 48",
    },
  )
  .refine(
    (env) =>
      env.NODE_ENV !== "production" ||
      !/change-me|dev-secret|super-secret/i.test(env.JWT_SECRET),
    {
      path: ["JWT_SECRET"],
      message: "JWT_SECRET is still a placeholder value. Set a real secret.",
    },
  )
  // The dev auth bypass disables every admin guard. It must never ship.
  .refine((env) => env.NODE_ENV !== "production" || !env.AUTH_DEV_BYPASS, {
    path: ["AUTH_DEV_BYPASS"],
    message: "AUTH_DEV_BYPASS cannot be enabled in production.",
  })
  .refine((env) => env.RAG_RERANK_TOP_N <= env.RAG_TOP_K, {
    path: ["RAG_RERANK_TOP_N"],
    message: "RAG_RERANK_TOP_N cannot exceed RAG_TOP_K.",
  })
  .refine((env) => env.RAG_CHUNK_OVERLAP < env.RAG_CHUNK_SIZE, {
    path: ["RAG_CHUNK_OVERLAP"],
    message: "RAG_CHUNK_OVERLAP must be smaller than RAG_CHUNK_SIZE.",
  })
  /**
   * The one misconfiguration that cannot be allowed to boot.
   *
   * `nemotron-3-embed-1b` returns 2048 floats and offers no way to ask for
   * fewer — it is not a Matryoshka model, so truncating the vector would
   * quietly wreck retrieval rather than fail. Leaving `EMBEDDING_DIMENSIONS`
   * at Gemini's 768 starts an API that answers health checks, serves the site,
   * and then throws on the first chunk of the first re-index. Catching it here
   * turns a confusing runtime failure into a boot-time sentence.
   */
  .refine(
    (env) =>
      env.LLM_PROVIDER !== "nvidia" ||
      !env.NVIDIA_EMBEDDING_MODEL.includes("nemotron-3-embed-1b") ||
      env.EMBEDDING_DIMENSIONS === 2048,
    {
      path: ["EMBEDDING_DIMENSIONS"],
      message:
        "nvidia/nemotron-3-embed-1b produces 2048-dimensional vectors. Set " +
        "EMBEDDING_DIMENSIONS=2048 and run the vector-width migration " +
        "(pnpm --filter @ai-portfolio/api prisma migrate deploy), then " +
        "re-index — existing 768-d vectors are not convertible.",
    },
  )
  /**
   * Re-ranking via NIM without a key would fall back to lexical on every
   * single query: the feature would appear enabled, cost a failed request and
   * a warning per query, and deliver nothing.
   */
  .refine(
    (env) =>
      env.RAG_RERANK_PROVIDER !== "nvidia" || env.NVIDIA_API_KEY.trim() !== "",
    {
      path: ["RAG_RERANK_PROVIDER"],
      message:
        "RAG_RERANK_PROVIDER=nvidia requires NVIDIA_API_KEY. Leave it as " +
        "'lexical' to use the local re-ranker.",
    },
  );

export type Env = z.infer<typeof envSchema>;

/** Thrown when the process environment fails validation. */
export class EnvValidationError extends Error {
  constructor(readonly issues: z.ZodIssue[]) {
    const detail = issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    super(`Invalid environment configuration:\n${detail}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Parses and validates a raw environment bag. Pure and side-effect free, so
 * it can be unit-tested without mutating `process.env`.
 */
export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) throw new EnvValidationError(result.error.issues);
  return result.data;
}
