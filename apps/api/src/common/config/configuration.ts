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

export function buildConfig(env: Env): AppConfig {
  const apiKey = env.GEMINI_API_KEY.trim();

  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    isTest: env.NODE_ENV === "test",
    port: env.API_PORT,
    appUrl: env.APP_URL,
    corsOrigins: Object.freeze(
      Array.from(new Set([env.APP_URL, ...env.CORS_ORIGINS])),
    ),
    logLevel: env.LOG_LEVEL,

    database: Object.freeze({ url: env.DATABASE_URL }),

    redis: env.REDIS_URL ? Object.freeze({ url: env.REDIS_URL }) : null,

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
      dir: env.UPLOAD_DIR,
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
