import { Injectable, Logger } from "@nestjs/common";
import { DependencyUnavailableError } from "../../core/errors/domain.errors";
import type { FileStoragePort, StoredFile } from "../../core/ports";

/**
 * File storage that refuses every write and read.
 *
 * Bound in place of `LocalFileStorage` when the API runs as a Vercel Function.
 * A Function's filesystem is read-only apart from `/tmp`, and `/tmp` does not
 * survive to the next invocation — so a document uploaded on one request would
 * be unreadable by the ingestion job that follows it. Worse, that job is
 * scheduled after the HTTP response, which is exactly when the platform
 * freezes the instance.
 *
 * Failing at the boundary with a 503 is the honest outcome: the caller learns
 * immediately that this deployment cannot ingest, instead of watching a
 * document sit at `PENDING` forever with nothing in the logs.
 *
 * To make ingestion work on Vercel, bind `FILE_STORAGE_PORT` to an
 * object-storage adapter (Vercel Blob, S3, R2) and move the ingestion job onto
 * a platform that runs it — Vercel Cron, QStash, or the existing BullMQ worker
 * on a container host. No other code changes.
 */
@Injectable()
export class UnavailableFileStorage implements FileStoragePort {
  private readonly logger = new Logger(UnavailableFileStorage.name);

  private static readonly REASON =
    "Document ingestion is disabled on this deployment. The API runs as a " +
    "serverless function, which has no persistent filesystem and no worker " +
    "process to run the embedding job. Seed content with `pnpm db:seed` " +
    "against the production database, or run the API on a container host.";

  async save(): Promise<StoredFile> {
    throw new DependencyUnavailableError(
      "file-storage",
      UnavailableFileStorage.REASON,
    );
  }

  async read(): Promise<Buffer> {
    throw new DependencyUnavailableError(
      "file-storage",
      UnavailableFileStorage.REASON,
    );
  }

  /**
   * Deleting is a no-op rather than an error. `delete` is documented as
   * best-effort and is called during document removal — a deployment that
   * never stored a file should still be able to delete the database row.
   */
  async delete(key: string): Promise<void> {
    this.logger.debug(`Ignoring delete for "${key}": no file storage bound.`);
  }

  async exists(): Promise<boolean> {
    return false;
  }
}
