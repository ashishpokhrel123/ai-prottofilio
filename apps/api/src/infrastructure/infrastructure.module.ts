import { Global, Logger, Module, type Provider } from "@nestjs/common";
import { AppConfigService } from "../common/config/app-config.service";
import {
  EMBEDDING_PORT,
  FILE_STORAGE_PORT,
  JOB_QUEUE_PORT,
  LLM_PORT,
  RERANKER_PORT,
  VECTOR_STORE_PORT,
} from "../core/ports";
import { Reranker } from "../lib/retriever/reranker";
import { GeminiAdapter } from "./llm/gemini.adapter";
import { NvidiaAdapter } from "./llm/nvidia.adapter";
import { NvidiaReranker } from "./llm/nvidia.reranker";
import { PrismaService } from "./persistence/prisma.service";
import { BullMqJobQueue } from "./queue/bullmq.queue";
import { InlineJobQueue } from "./queue/inline.queue";
import { LocalFileStorage } from "./storage/local-file.storage";
import { UnavailableFileStorage } from "./storage/unavailable-file.storage";
import { PgVectorStore } from "./vector/pgvector.store";

/**
 * The composition root.
 *
 * This is the only module that knows which concrete adapter satisfies which
 * port. Everything downstream injects a port token and is therefore testable
 * with a plain object stub and portable across vendors.
 */

/**
 * Both vendor adapters are constructed unconditionally; only one is bound.
 *
 * An adapter with no key is inert — it logs a warning and reports
 * `isConfigured: false` — so instantiating the unused one costs nothing and
 * keeps the factories below free of conditional injection. The `LLM_PROVIDER`
 * switch decides which one the application actually talks to.
 */
const adapters: Provider[] = [GeminiAdapter, NvidiaAdapter, Reranker];

const useNvidia = (config: AppConfigService): boolean =>
  config.llmProvider === "nvidia";

/**
 * One adapter instance serves both the LLM and embedding ports — the same
 * object, not two. Generation and embeddings must come from the same vendor,
 * because only the embedding side determines the vector column's width.
 */
const llmProviders: Provider[] = [
  {
    provide: LLM_PORT,
    inject: [AppConfigService, GeminiAdapter, NvidiaAdapter],
    useFactory: (
      config: AppConfigService,
      gemini: GeminiAdapter,
      nvidia: NvidiaAdapter,
    ) => {
      const chosen = useNvidia(config) ? nvidia : gemini;
      new Logger("InfrastructureModule").log(
        `LLM provider: ${config.llmProvider} (${chosen.model})`,
      );
      return chosen;
    },
  },
  {
    provide: EMBEDDING_PORT,
    inject: [AppConfigService, GeminiAdapter, NvidiaAdapter],
    useFactory: (
      config: AppConfigService,
      gemini: GeminiAdapter,
      nvidia: NvidiaAdapter,
    ) => (useNvidia(config) ? nvidia : gemini),
  },
];

/**
 * Re-ranking is chosen independently of the generation provider.
 *
 * Deliberately not folded into `LLM_PROVIDER`: the cross-encoder adds a
 * network round-trip to every single query, so whether it is worth the latency
 * is a separate judgement from which model writes the answer. It is also the
 * one NVIDIA piece that is useful while the rest of the stack stays on Gemini.
 */
const rerankerProvider: Provider = {
  provide: RERANKER_PORT,
  inject: [AppConfigService, Reranker],
  useFactory: (config: AppConfigService, lexical: Reranker) => {
    if (config.rag.rerankProvider !== "nvidia") return lexical;

    new Logger("InfrastructureModule").log(
      `Re-ranking via NVIDIA NIM (${config.nvidia.rerankModel}), ` +
        "falling back to lexical on failure.",
    );
    return new NvidiaReranker(config, lexical);
  },
};

/**
 * Storage selection is a deployment concern. A serverless host has no
 * filesystem worth writing to, so the ingestion path is closed at its entrance
 * rather than left to fail three layers down.
 */
const storageProvider: Provider = {
  provide: FILE_STORAGE_PORT,
  inject: [AppConfigService],
  useFactory: (config: AppConfigService) => {
    const logger = new Logger("InfrastructureModule");

    if (config.isServerless) {
      logger.warn(
        "Serverless runtime detected — file storage disabled. Uploads and " +
          "reindexing will return 503; chat and read paths are unaffected.",
      );
      return new UnavailableFileStorage();
    }

    return new LocalFileStorage(config);
  },
};

/**
 * Queue selection is a deployment concern, resolved once at boot: BullMQ when
 * Redis is configured, in-process execution otherwise.
 */
const queueProvider: Provider = {
  provide: JOB_QUEUE_PORT,
  inject: [AppConfigService],
  useFactory: (config: AppConfigService) => {
    const logger = new Logger("InfrastructureModule");

    if (config.redis) {
      // A queue with no consumer is worse than no queue: enqueue succeeds, the
      // document reports PENDING, and nothing ever moves it. Say so at boot.
      if (config.isServerless) {
        logger.warn(
          "REDIS_URL is set on a serverless runtime. Nothing consumes this " +
            "queue unless the ingestion worker runs elsewhere — jobs will " +
            "sit unprocessed. Unset REDIS_URL to make that explicit.",
        );
      }

      logger.log("Redis detected — background ingestion via BullMQ.");
      return new BullMqJobQueue(config);
    }

    logger.warn(
      "No REDIS_URL — ingestion will run in-process. Set REDIS_URL for durable background jobs.",
    );
    return new InlineJobQueue();
  },
};

@Global()
@Module({
  providers: [
    PrismaService,
    ...adapters,
    ...llmProviders,
    rerankerProvider,
    PgVectorStore,
    { provide: VECTOR_STORE_PORT, useExisting: PgVectorStore },
    storageProvider,
    queueProvider,
  ],
  exports: [
    PrismaService,
    LLM_PORT,
    EMBEDDING_PORT,
    RERANKER_PORT,
    VECTOR_STORE_PORT,
    FILE_STORAGE_PORT,
    JOB_QUEUE_PORT,
  ],
})
export class InfrastructureModule {}
