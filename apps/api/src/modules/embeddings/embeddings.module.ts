import {
  Body,
  Controller,
  Inject,
  Injectable,
  Logger,
  Module,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";
import { JOB_QUEUE_PORT, type JobQueuePort } from "../../core/ports";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

export class IndexRequestDto {
  @ApiPropertyOptional({
    description:
      "Index a single document. Omit to index everything pending or failed.",
  })
  @IsOptional()
  @IsUUID(4)
  documentId?: string;
}

export interface IndexResult {
  readonly queued: number;
  /** Documents with no local source file — they need a re-sync, not a re-index. */
  readonly skipped: number;
  readonly skippedTitles: readonly string[];
}

@Injectable()
export class EmbeddingsIndexService {
  private readonly logger = new Logger(EmbeddingsIndexService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_QUEUE_PORT) private readonly queue: JobQueuePort,
  ) {}

  /** Queues (re)indexing for one document, or for every pending/failed one. */
  async index(documentId?: string): Promise<IndexResult> {
    const documents = await this.prisma.document.findMany({
      where: documentId
        ? { id: documentId }
        : { status: { in: ["PENDING", "FAILED"] } },
      select: { id: true, title: true, filePath: true, mimeType: true },
    });

    // A document with no stored file (anything ingested from fetched text,
    // i.e. GitHub) has no local source to re-read. Queueing it anyway produced
    // a job with neither text nor a storage key, which the worker threw on,
    // retried three times, then dropped — a silent failure with no UI signal.
    const reindexable = documents.filter((doc) => doc.filePath !== null);
    const skipped = documents.filter((doc) => doc.filePath === null);

    for (const doc of reindexable) {
      await this.queue.enqueueIngestion({
        documentId: doc.id,
        storageKey: doc.filePath ?? undefined,
        mimeType: doc.mimeType ?? undefined,
      });
    }

    if (skipped.length > 0) {
      this.logger.warn(
        `Skipped ${skipped.length} document(s) with no stored source file: ` +
          `${skipped.map((d) => d.title).join(", ")}. Re-run the relevant sync to refresh them.`,
      );
    }

    return {
      queued: reindexable.length,
      skipped: skipped.length,
      skippedTitles: skipped.map((d) => d.title),
    };
  }
}

@ApiTags("embeddings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("embeddings")
export class EmbeddingsController {
  constructor(private readonly embeddings: EmbeddingsIndexService) {}

  @Post("index")
  @ApiOperation({
    summary: "Queue documents for (re)indexing into the vector store.",
  })
  index(@Body() dto: IndexRequestDto) {
    return this.embeddings.index(dto.documentId);
  }
}

@Module({
  imports: [AuthModule],
  providers: [EmbeddingsIndexService],
  controllers: [EmbeddingsController],
})
export class EmbeddingsModule {}
