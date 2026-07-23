import {
  Body,
  Controller,
  Post,
  UseGuards,
  Injectable,
  Module,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../common/config/prisma.service";
import { ingestionQueue } from "../../common/config/queue";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Injectable()
export class EmbeddingsIndexService {
  constructor(private readonly prisma: PrismaService) {}

  /** Queue (re)indexing for pending/failed documents, or a specific id. */
  async index(documentId?: string) {
    const docs = documentId
      ? await this.prisma.document.findMany({ where: { id: documentId } })
      : await this.prisma.document.findMany({
          where: { status: { in: ["PENDING", "FAILED"] } },
        });

    for (const d of docs) {
      await ingestionQueue().add("ingest", {
        documentId: d.id,
        filePath: d.filePath ?? undefined,
        mimeType: d.mimeType ?? undefined,
      });
    }
    return { queued: docs.length };
  }
}

@ApiTags("embeddings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("embeddings")
export class EmbeddingsController {
  constructor(private readonly svc: EmbeddingsIndexService) {}

  @Post("index")
  index(@Body() body: { documentId?: string }) {
    return this.svc.index(body?.documentId);
  }
}

@Module({
  providers: [EmbeddingsIndexService],
  controllers: [EmbeddingsController],
})
export class EmbeddingsModule {}
