import { Global, Logger, Module, type Provider } from "@nestjs/common";
import { AppConfigService } from "../common/config/app-config.service";
import {
  EMBEDDING_PORT,
  FILE_STORAGE_PORT,
  JOB_QUEUE_PORT,
  LLM_PORT,
  VECTOR_STORE_PORT,
} from "../core/ports";
import { GeminiAdapter } from "./llm/gemini.adapter";
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

/** One Gemini instance serves both the LLM and embedding ports. */
const geminiProviders: Provider[] = [
  GeminiAdapter,
  { provide: LLM_PORT, useExisting: GeminiAdapter },
  { provide: EMBEDDING_PORT, useExisting: GeminiAdapter },
];

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
    ...geminiProviders,
    PgVectorStore,
    { provide: VECTOR_STORE_PORT, useExisting: PgVectorStore },
    storageProvider,
    queueProvider,
  ],
  exports: [
    PrismaService,
    LLM_PORT,
    EMBEDDING_PORT,
    VECTOR_STORE_PORT,
    FILE_STORAGE_PORT,
    JOB_QUEUE_PORT,
  ],
})
export class InfrastructureModule {}
