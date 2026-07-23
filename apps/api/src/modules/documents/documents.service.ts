import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/config/prisma.service";
import { ingestionQueue } from "../../common/config/queue";

export interface UploadMeta {
  title: string;
  docType?: string;
  source?: string;
  tags?: string[];
  author?: string;
  filePath: string;
  mimeType?: string;
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Register the document, then enqueue background ingestion (returns fast). */
  async upload(meta: UploadMeta) {
    const doc = await this.prisma.document.create({
      data: {
        title: meta.title,
        docType: (meta.docType as any) ?? "OTHER",
        source: (meta.source as any) ?? "MANUAL_UPLOAD",
        tags: meta.tags ?? [],
        author: meta.author,
        filePath: meta.filePath,
        mimeType: meta.mimeType,
        status: "PENDING",
      },
    });

    await ingestionQueue().add(
      "ingest",
      { documentId: doc.id, filePath: meta.filePath, mimeType: meta.mimeType },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
      },
    );

    return { id: doc.id, status: doc.status };
  }

  list() {
    return this.prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        docType: true,
        source: true,
        status: true,
        tags: true,
        createdAt: true,
      },
    });
  }

  async reindex(id: string) {
    await this.prisma.document.update({
      where: { id },
      data: { status: "PENDING" },
    });
    const doc = await this.prisma.document.findUniqueOrThrow({ where: { id } });
    await ingestionQueue().add("ingest", {
      documentId: id,
      filePath: doc.filePath ?? undefined,
      mimeType: doc.mimeType ?? undefined,
    });
    return { id, status: "PENDING" };
  }

  async remove(id: string) {
    await this.prisma.document.delete({ where: { id } });
    return { id, deleted: true };
  }
}
