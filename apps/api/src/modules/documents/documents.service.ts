import { Inject, Injectable, Logger } from "@nestjs/common";
import type { DocumentStatus, DocumentType, SourceType } from "@prisma/client";
import {
  ResourceNotFoundError,
  UnsupportedOperationError,
} from "../../core/errors/domain.errors";
import {
  FILE_STORAGE_PORT,
  JOB_QUEUE_PORT,
  type FileStoragePort,
  type JobQueuePort,
} from "../../core/ports";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";

export interface UploadCommand {
  readonly buffer: Buffer;
  readonly originalName: string;
  readonly mimeType?: string;
  readonly title?: string;
  readonly docType?: DocumentType;
  readonly source?: SourceType;
  readonly tags?: readonly string[];
  readonly author?: string;
}

export interface DocumentSummary {
  readonly id: string;
  readonly status: DocumentStatus;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_PORT) private readonly storage: FileStoragePort,
    @Inject(JOB_QUEUE_PORT) private readonly queue: JobQueuePort,
  ) {}

  /**
   * Stores the file, registers the document, then queues ingestion.
   *
   * The response returns as soon as the row exists — extraction and embedding
   * of a large PDF takes tens of seconds and has no business blocking an HTTP
   * request. The client polls `status` instead.
   */
  async upload(command: UploadCommand): Promise<DocumentSummary> {
    const stored = await this.storage.save(command.buffer, {
      originalName: command.originalName,
      mimeType: command.mimeType,
    });

    const document = await this.prisma.document.create({
      data: {
        title: command.title?.trim() || command.originalName,
        docType: command.docType ?? "OTHER",
        source: command.source ?? "MANUAL_UPLOAD",
        tags: [...(command.tags ?? [])],
        author: command.author,
        filePath: stored.key,
        mimeType: command.mimeType,
        status: "PENDING",
      },
      select: { id: true, status: true },
    });

    await this.queue.enqueueIngestion({
      documentId: document.id,
      storageKey: stored.key,
      mimeType: command.mimeType,
    });

    return document;
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
        _count: { select: { chunks: true } },
      },
    });
  }

  async reindex(id: string): Promise<DocumentSummary> {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: { id: true, filePath: true, mimeType: true, source: true },
    });

    if (!document) throw new ResourceNotFoundError("Document", id);

    // Synced documents (GitHub) are ingested from fetched text and never have
    // a stored file, so there is nothing local to re-read. Re-running the sync
    // is the only way to refresh them — say so rather than 404ing.
    if (!document.filePath) {
      throw new UnsupportedOperationError(
        document.source === "GITHUB"
          ? "GitHub documents cannot be re-indexed individually. Run a GitHub sync to refresh them."
          : "This document has no stored source file to re-index.",
        { documentId: id, source: document.source },
      );
    }

    await this.prisma.document.update({
      where: { id },
      data: { status: "PENDING" },
    });

    await this.queue.enqueueIngestion({
      documentId: id,
      storageKey: document.filePath,
      mimeType: document.mimeType ?? undefined,
    });

    return { id, status: "PENDING" };
  }

  /** Deletes the row (chunks cascade) and the stored file. */
  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: { filePath: true },
    });

    if (!document) throw new ResourceNotFoundError("Document", id);

    await this.prisma.document.delete({ where: { id } });

    // Orphaned bytes are wasted disk, not a failure — the record is gone.
    if (document.filePath) await this.storage.delete(document.filePath);

    this.logger.log(`Deleted document ${id}`);
    return { id, deleted: true };
  }
}
