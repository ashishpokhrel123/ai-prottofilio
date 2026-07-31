import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "../../common/config/app-config.service";
import {
  ResourceNotFoundError,
  errorMessage,
} from "../../core/errors/domain.errors";
import {
  EMBEDDING_PORT,
  FILE_STORAGE_PORT,
  VECTOR_STORE_PORT,
  type EmbeddingPort,
  type FileStoragePort,
  type VectorStorePort,
} from "../../core/ports";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { chunkText } from "./chunker";
import { extractText } from "./extractor";

/** Embedding requests per batch. Balances API round trips against payload size. */
const EMBED_BATCH_SIZE = 32;

/**
 * The ingestion pipeline:
 *   extract → chunk → embed → store vector → mark INDEXED
 *
 * Invoked from the BullMQ worker in production and, when no Redis is
 * configured, in-process by `InlineJobQueue`. Both paths share this code.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PORT) private readonly embeddings: EmbeddingPort,
    @Inject(VECTOR_STORE_PORT) private readonly vectors: VectorStorePort,
    @Inject(FILE_STORAGE_PORT) private readonly storage: FileStoragePort,
  ) {}

  /** Ingest raw text — used by GitHub sync and any other non-file source. */
  async ingestText(documentId: string, text: string): Promise<number> {
    await this.setStatus(documentId, "PROCESSING");

    try {
      const { chunkSize, chunkOverlap } = this.config.rag;
      const chunks = chunkText(text, { chunkSize, overlap: chunkOverlap });

      if (chunks.length === 0) {
        this.logger.warn(`Document ${documentId} produced no chunks.`);
        await this.setStatus(documentId, "FAILED");
        return 0;
      }

      // Replace rather than append, so a re-index cannot duplicate content.
      await this.prisma.chunk.deleteMany({ where: { documentId } });

      const created = await this.prisma.chunk.createManyAndReturn({
        data: chunks.map((c) => ({
          documentId,
          content: c.content,
          chunkIndex: c.index,
          tokens: c.tokens,
        })),
        select: { id: true, content: true },
      });

      await this.embedAll(created);
      await this.setStatus(documentId, "INDEXED");

      this.logger.log(
        `Indexed document ${documentId} → ${created.length} chunks`,
      );
      return created.length;
    } catch (err) {
      this.logger.error(
        `Ingestion failed for ${documentId}: ${errorMessage(err)}`,
      );
      await this.setStatus(documentId, "FAILED");
      throw err;
    }
  }

  /** Ingest a file previously written to storage. */
  async ingestFile(
    documentId: string,
    storageKey: string,
    mimeType?: string,
  ): Promise<number> {
    const buffer = await this.storage.read(storageKey);
    const text = await extractText(buffer, storageKey, mimeType);
    return this.ingestText(documentId, text);
  }

  /** Wipe and rebuild a document's chunks from its original source. */
  async reindex(documentId: string): Promise<number> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { filePath: true, mimeType: true },
    });

    if (!doc) throw new ResourceNotFoundError("Document", documentId);
    if (!doc.filePath) {
      throw new ResourceNotFoundError("Source file for document", documentId);
    }

    return this.ingestFile(documentId, doc.filePath, doc.mimeType ?? undefined);
  }

  /**
   * Embeds chunks in batches and writes each batch in a single round trip.
   * Batching is what keeps a 500-chunk résumé from becoming 500 UPDATEs.
   */
  private async embedAll(
    chunks: readonly { id: string; content: string }[],
  ): Promise<void> {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const vectors = await this.embeddings.embedDocuments(
        batch.map((c) => c.content),
      );

      await this.vectors.saveEmbeddings(
        batch.map((chunk, j) => ({
          chunkId: chunk.id,
          embedding: vectors[j],
        })),
      );
    }
  }

  private async setStatus(
    documentId: string,
    status: "PENDING" | "PROCESSING" | "INDEXED" | "FAILED",
  ): Promise<void> {
    await this.prisma.document
      .update({ where: { id: documentId }, data: { status } })
      .catch((err: unknown) =>
        this.logger.warn(
          `Could not set status ${status} on ${documentId}: ${errorMessage(err)}`,
        ),
      );
  }
}
