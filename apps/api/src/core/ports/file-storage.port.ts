export interface StoredFile {
  /** Opaque storage key. Never a caller-controlled path. */
  readonly key: string;
  readonly size: number;
  readonly mimeType?: string;
}

/**
 * Binary storage for uploaded documents.
 *
 * Abstracted because the local-disk implementation only works on a host with a
 * writable, persistent filesystem. Swapping in S3 or Vercel Blob is a new
 * adapter, not a change to the ingestion pipeline.
 */
export interface FileStoragePort {
  /** Persist bytes and return the key needed to read them back. */
  save(
    buffer: Buffer,
    meta: { originalName: string; mimeType?: string },
  ): Promise<StoredFile>;

  /** Read a previously stored file. Throws `ResourceNotFoundError` if gone. */
  read(key: string): Promise<Buffer>;

  /** Best-effort delete. Must not throw when the key is already absent. */
  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;
}
