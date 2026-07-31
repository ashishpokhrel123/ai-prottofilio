/** Payload for one document-ingestion unit of work. */
export interface IngestionJob {
  readonly documentId: string;
  /** Storage key of the uploaded file, when the source is a file. */
  readonly storageKey?: string;
  readonly mimeType?: string;
  /** Raw text, when the source is a sync (GitHub README, etc.) rather than a file. */
  readonly text?: string;
}

export interface QueueHealth {
  readonly mode: "queued" | "inline";
  readonly healthy: boolean;
  readonly detail?: string;
}

/**
 * Background work dispatch.
 *
 * Two implementations exist: `BullMqJobQueue` (Redis-backed, the production
 * path) and `InlineJobQueue` (runs the job in-process). The inline adapter
 * exists so the app is deployable on hosts without Redis — the trade-off is a
 * slower upload request, not a broken feature.
 */
export interface JobQueuePort {
  enqueueIngestion(job: IngestionJob): Promise<void>;
  health(): Promise<QueueHealth>;
  /** Release connections on shutdown. */
  close(): Promise<void>;
}
