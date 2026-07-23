import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { Worker } from "bullmq";
import { AppModule } from "../app.module";
import { IngestionService } from "../lib/embeddings/ingestion.service";
import {
  INGESTION_QUEUE,
  IngestionJob,
  redisConnection,
} from "../common/config/queue";

/**
 * Standalone BullMQ worker process. Boots a Nest application context so it can
 * reuse the same DI graph (Prisma, embeddings, ingestion) as the API, then
 * consumes ingestion jobs concurrently.
 *
 * Run with: `pnpm --filter @ai-portfolio/api start:worker`
 */
async function bootstrap() {
  const logger = new Logger("IngestionWorker");
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: false,
  });
  const ingestion = app.get(IngestionService);

  const worker = new Worker<IngestionJob>(
    INGESTION_QUEUE,
    async (job) => {
      const { documentId, filePath, mimeType, text } = job.data;
      logger.log(`Processing job ${job.id} for document ${documentId}`);
      if (text) return ingestion.ingestText(documentId, text);
      if (filePath) return ingestion.ingestFile(documentId, filePath, mimeType);
      throw new Error("Job has neither text nor filePath.");
    },
    { connection: redisConnection(), concurrency: 3 },
  );

  worker.on("completed", (job, result) =>
    logger.log(`Job ${job.id} done (${result} chunks)`),
  );
  worker.on("failed", (job, err) =>
    logger.error(`Job ${job?.id} failed: ${err.message}`),
  );

  logger.log("Ingestion worker started, waiting for jobs...");
}
void bootstrap();
