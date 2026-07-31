import { loadEnvFiles } from "../common/config/load-env";

// Must run before anything reads configuration.
loadEnvFiles();

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Worker, type Job } from "bullmq";
import { AppModule } from "../app.module";
import { AppConfigService } from "../common/config/app-config.service";
import { errorDetail } from "../core/errors/domain.errors";
import type { IngestionJob } from "../core/ports";
import {
  INGESTION_QUEUE,
  createRedisConnection,
} from "../infrastructure/queue/bullmq.queue";
import { IngestionService } from "../lib/embeddings/ingestion.service";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 3);

/**
 * Standalone BullMQ worker.
 *
 * Boots a Nest application *context* — no HTTP server — so it reuses the exact
 * same DI graph as the API (config, Prisma, embeddings, vector store) without
 * duplicating wiring or binding a port.
 *
 * Run with: `pnpm --filter @ai-portfolio/api start:worker`
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger("IngestionWorker");
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: false,
  });

  const config = app.get(AppConfigService);

  if (!config.redis) {
    logger.error(
      "REDIS_URL is not set, so there is no queue to consume. The API is " +
        "running in inline ingestion mode and this process is unnecessary.",
    );
    await app.close();
    process.exit(1);
  }

  const ingestion = app.get(IngestionService);
  const connection = createRedisConnection(config.redis.url);

  const worker = new Worker<IngestionJob>(
    INGESTION_QUEUE,
    async (job: Job<IngestionJob>) => {
      const { documentId, storageKey, mimeType, text } = job.data;
      logger.log(`Processing job ${job.id} for document ${documentId}`);

      if (text) return ingestion.ingestText(documentId, text);
      if (storageKey) {
        return ingestion.ingestFile(documentId, storageKey, mimeType);
      }
      throw new Error(`Job ${job.id} has neither text nor a storage key.`);
    },
    { connection, concurrency: CONCURRENCY },
  );

  worker.on("completed", (job, result) =>
    logger.log(`Job ${job.id} completed (${String(result)} chunks)`),
  );

  worker.on("failed", (job, err) =>
    logger.error(`Job ${job?.id} failed: ${err.message}`),
  );

  // Graceful shutdown: finish the in-flight job before the platform kills the
  // container, so a half-embedded document isn't left stuck in PROCESSING.
  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Received ${signal}, draining worker...`);
    await worker.close();
    await connection.quit().catch(() => undefined);
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  logger.log(`Ingestion worker started (concurrency ${CONCURRENCY}).`);
}

bootstrap().catch((err: unknown) => {
  new Logger("IngestionWorker").error(errorDetail(err));
  process.exit(1);
});
