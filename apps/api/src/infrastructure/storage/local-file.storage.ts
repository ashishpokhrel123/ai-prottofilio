import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "../../common/config/app-config.service";
import {
  InvalidInputError,
  ResourceNotFoundError,
  errorMessage,
} from "../../core/errors/domain.errors";
import type { FileStoragePort, StoredFile } from "../../core/ports";

/** Extensions the ingestion pipeline can actually extract text from. */
const ALLOWED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".pdf",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

/**
 * Local-disk file storage.
 *
 * Suitable for a container with a mounted volume. On a host with an ephemeral
 * or read-only filesystem, bind `FILE_STORAGE_PORT` to an object-storage
 * adapter instead — no other code changes.
 */
@Injectable()
export class LocalFileStorage implements FileStoragePort {
  private readonly logger = new Logger(LocalFileStorage.name);
  private readonly root: string;

  constructor(config: AppConfigService) {
    const dir = config.uploads.dir;
    this.root = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  async save(
    buffer: Buffer,
    meta: { originalName: string; mimeType?: string },
  ): Promise<StoredFile> {
    const ext = extname(meta.originalName).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new InvalidInputError(
        `Unsupported file type "${ext || "(none)"}".`,
        { allowed: [...ALLOWED_EXTENSIONS] },
      );
    }

    // The key is generated, never derived from the client-supplied filename —
    // that is what makes path traversal structurally impossible here.
    const key = `${Date.now()}-${randomUUID()}${ext}`;

    await mkdir(this.root, { recursive: true });
    await writeFile(this.resolveKey(key), buffer);

    return { key, size: buffer.byteLength, mimeType: meta.mimeType };
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolveKey(key));
    } catch (err) {
      if (isNotFound(err)) throw new ResourceNotFoundError("File", key);
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (err) {
      // Deleting an already-absent file is a success, not a failure.
      if (isNotFound(err)) return;
      this.logger.warn(`Failed to delete "${key}": ${errorMessage(err)}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolves a key to an absolute path, rejecting anything that escapes the
   * storage root. Defence in depth: keys are generated, but a future caller
   * might pass one through from a database row that predates this rule.
   */
  private resolveKey(key: string): string {
    if (!key || key.includes("\0")) {
      throw new InvalidInputError("Invalid storage key.");
    }

    const path = normalize(join(this.root, key));
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw new InvalidInputError("Storage key escapes the storage root.");
    }
    return path;
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
