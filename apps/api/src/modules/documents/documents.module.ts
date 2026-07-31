import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { AppConfigService } from "../../common/config/app-config.service";
import { JOB_QUEUE_PORT, type JobQueuePort } from "../../core/ports";
import { IngestionService } from "../../lib/embeddings/ingestion.service";
import { InlineJobQueue } from "../../infrastructure/queue/inline.queue";
import { AuthModule } from "../auth/auth.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

/**
 * Documents feature module.
 *
 * Also closes the loop for the Redis-free deployment: `InlineJobQueue` cannot
 * import `IngestionService` directly (that would be a cycle), so the handler is
 * injected here at startup instead.
 */
@Module({
  imports: [
    AuthModule,
    // Multer's limit is the real ceiling — it aborts mid-stream, before the
    // body is buffered. Deriving it from config keeps it from drifting out of
    // sync with MAX_UPLOAD_BYTES, which previously only got checked *after*
    // the whole file was already in memory.
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        storage: memoryStorage(),
        limits: { fileSize: config.uploads.maxBytes, files: 1 },
      }),
    }),
  ],
  providers: [DocumentsService],
  controllers: [DocumentsController],
  exports: [DocumentsService],
})
export class DocumentsModule implements OnModuleInit {
  constructor(
    @Inject(JOB_QUEUE_PORT) private readonly queue: JobQueuePort,
    private readonly ingestion: IngestionService,
  ) {}

  onModuleInit(): void {
    if (!(this.queue instanceof InlineJobQueue)) return;

    this.queue.registerHandler(async (job) => {
      if (job.text) return this.ingestion.ingestText(job.documentId, job.text);
      if (job.storageKey) {
        return this.ingestion.ingestFile(
          job.documentId,
          job.storageKey,
          job.mimeType,
        );
      }
      throw new Error(
        `Ingestion job ${job.documentId} has neither text nor a file.`,
      );
    });
  }
}
