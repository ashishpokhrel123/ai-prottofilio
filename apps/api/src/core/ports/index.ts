/**
 * Ports — the interfaces the application core depends on.
 *
 * Nothing in this directory may import a vendor SDK, Prisma, or a Nest
 * decorator beyond DI tokens. Concrete implementations live in
 * `src/infrastructure/**` and are bound to these tokens in `InfrastructureModule`.
 *
 * This is what makes "swap Gemini for OpenAI" or "swap pgvector for Qdrant" a
 * change to one adapter file rather than a change to the agent.
 */

export * from "./llm.port";
export * from "./embedding.port";
export * from "./reranker.port";
export * from "./vector-store.port";
export * from "./file-storage.port";
export * from "./job-queue.port";
export * from "./tokens";
