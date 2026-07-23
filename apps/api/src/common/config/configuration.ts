export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.API_PORT ?? 4000),
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  database: { url: process.env.DATABASE_URL },
  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? "dev-secret",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    llmModel: process.env.GEMINI_LLM_MODEL ?? "gemini-2.5-pro",
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004",
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 768),
  },
  rag: {
    topK: Number(process.env.RAG_TOP_K ?? 8),
    rerankTopN: Number(process.env.RAG_RERANK_TOP_N ?? 4),
    chunkSize: Number(process.env.RAG_CHUNK_SIZE ?? 800),
    chunkOverlap: Number(process.env.RAG_CHUNK_OVERLAP ?? 120),
    minSimilarity: Number(process.env.RAG_MIN_SIMILARITY ?? 0.35),
  },
  github: {
    token: process.env.GITHUB_TOKEN ?? "",
    username: process.env.GITHUB_USERNAME ?? "",
  },
});

export type AppConfig = ReturnType<typeof configuration>;
