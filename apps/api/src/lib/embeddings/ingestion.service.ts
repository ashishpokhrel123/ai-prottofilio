import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/config/prisma.service";
import { EmbeddingsService } from "./embeddings.service";
import { VectorRepository } from "../retriever/vector.repository";
import { extractText } from "./extractor";
import { chunkText } from "./chunker";

/**
 * The ingestion pipeline, callable from the HTTP layer or a BullMQ worker:
 *   extract → clean → chunk → embed → store vector + metadata → mark INDEXED
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly vectors: VectorRepository,
  ) {}

  /** Ingest raw text (used by GitHub/LinkedIn sync — no file on disk). */
  async ingestText(documentId: string, text: string): Promise<number> {
    const size = this.config.get<number>("rag.chunkSize") ?? 800;
    const overlap = this.config.get<number>("rag.chunkOverlap") ?? 120;

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: "PROCESSING" },
    });

    const chunks = chunkText(text, { chunkSize: size, overlap });
    if (chunks.length === 0) {
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: "FAILED" },
      });
      return 0;
    }

    // Create chunk rows first (so we have ids), then embed in batches.
    const created = await this.prisma.$transaction(
      chunks.map((c) =>
        this.prisma.chunk.create({
          data: {
            documentId,
            content: c.content,
            chunkIndex: c.index,
            tokens: c.tokens,
          },
          select: { id: true, content: true },
        }),
      ),
    );

    const BATCH = 32;
    for (let i = 0; i < created.length; i += BATCH) {
      const slice = created.slice(i, i + BATCH);
      const vectors = await this.embeddings.embedDocuments(
        slice.map((c) => c.content),
      );
      await Promise.all(
        slice.map((c, j) => this.vectors.saveEmbedding(c.id, vectors[j])),
      );
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: "INDEXED" },
    });
    this.logger.log(
      `Indexed document ${documentId} → ${created.length} chunks`,
    );
    return created.length;
  }

  /** Ingest a document that has a file on disk. */
  async ingestFile(
    documentId: string,
    filePath: string,
    mimeType?: string,
  ): Promise<number> {
    try {
      const text = await extractText(filePath, mimeType);
      return await this.ingestText(documentId, text);
    } catch (err) {
      this.logger.error(`Ingest failed for ${documentId}: ${String(err)}`);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: "FAILED" },
      });
      throw err;
    }
  }

  /** Re-index: wipe chunks and rebuild from the stored file. */
  async reindex(documentId: string): Promise<number> {
    const doc = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
    });
    await this.prisma.chunk.deleteMany({ where: { documentId } });
    if (!doc.filePath)
      throw new Error("Document has no source file to re-index.");
    return this.ingestFile(documentId, doc.filePath, doc.mimeType ?? undefined);
  }
}
