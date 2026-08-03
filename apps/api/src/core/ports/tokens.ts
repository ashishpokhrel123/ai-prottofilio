/**
 * DI tokens for every port. Interfaces vanish at runtime, so Nest needs a
 * concrete token to resolve them. Symbols (not strings) prevent collisions.
 */
export const LLM_PORT = Symbol("LlmPort");
export const EMBEDDING_PORT = Symbol("EmbeddingPort");
export const RERANKER_PORT = Symbol("RerankerPort");
export const VECTOR_STORE_PORT = Symbol("VectorStorePort");
export const FILE_STORAGE_PORT = Symbol("FileStoragePort");
export const JOB_QUEUE_PORT = Symbol("JobQueuePort");
