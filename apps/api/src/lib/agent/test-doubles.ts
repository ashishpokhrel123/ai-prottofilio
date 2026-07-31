import type {
  EmbeddingPort,
  LlmMessage,
  LlmPort,
  RetrievedChunk,
  VectorStorePort,
} from "../../core/ports";

/**
 * In-memory port implementations for tests.
 *
 * These exist because the agent depends on interfaces rather than on the
 * Gemini SDK and Prisma — the whole pipeline is exercisable with no network,
 * no database, and no mocking framework.
 */

export class FakeLlm implements LlmPort {
  isConfigured = true;
  model = "fake-model";

  /** Every `complete` call recorded, for asserting prompt construction. */
  readonly completions: { system: string; messages: LlmMessage[] }[] = [];
  readonly streams: { system: string; messages: LlmMessage[] }[] = [];

  constructor(
    private readonly responses: {
      complete?: string | (() => string);
      stream?: string[];
      failOn?: "complete" | "stream";
    } = {},
  ) {}

  async complete(
    system: string,
    messages: readonly LlmMessage[],
  ): Promise<string> {
    this.completions.push({ system, messages: [...messages] });

    if (this.responses.failOn === "complete") {
      throw new Error("simulated completion failure");
    }

    const value = this.responses.complete ?? "";
    return typeof value === "function" ? value() : value;
  }

  async *stream(
    system: string,
    messages: readonly LlmMessage[],
  ): AsyncGenerator<string> {
    this.streams.push({ system, messages: [...messages] });

    if (this.responses.failOn === "stream") {
      throw new Error("simulated stream failure");
    }

    for (const token of this.responses.stream ?? ["ok"]) {
      yield token;
    }
  }
}

export class FakeEmbeddings implements EmbeddingPort {
  readonly dimensions = 4;
  readonly queries: string[] = [];

  async embedQuery(text: string): Promise<number[]> {
    this.queries.push(text);
    return [0.1, 0.2, 0.3, 0.4];
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    return texts.map(() => [0.1, 0.2, 0.3, 0.4]);
  }
}

export class FakeVectorStore implements VectorStorePort {
  readonly saved: { chunkId: string; embedding: readonly number[] }[] = [];

  constructor(private readonly hits: RetrievedChunk[] = []) {}

  async similaritySearch(): Promise<RetrievedChunk[]> {
    return [...this.hits];
  }

  async hybridSearch(): Promise<RetrievedChunk[]> {
    return [...this.hits];
  }

  async saveEmbedding(
    chunkId: string,
    embedding: readonly number[],
  ): Promise<void> {
    this.saved.push({ chunkId, embedding });
  }

  async saveEmbeddings(
    entries: readonly { chunkId: string; embedding: readonly number[] }[],
  ): Promise<void> {
    this.saved.push(...entries);
  }
}

export function makeChunk(
  overrides: Partial<RetrievedChunk> = {},
): RetrievedChunk {
  return {
    id: "chunk-1",
    documentId: "doc-1",
    content: "The Immortalis project uses pgvector for retrieval.",
    title: "Immortalis",
    source: "MANUAL_UPLOAD",
    docType: "PROJECT",
    tags: [],
    score: 0.9,
    // Comfortably above the default 0.35 confidence floor, so a chunk is
    // "relevant" unless a test deliberately says otherwise.
    similarity: 0.9,
    ...overrides,
  };
}
