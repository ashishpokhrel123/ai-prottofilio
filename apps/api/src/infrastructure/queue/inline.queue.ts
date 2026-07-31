import { Injectable, Logger } from "@nestjs/common";
import { errorDetail } from "../../core/errors/domain.errors";
import type { IngestionJob, JobQueuePort, QueueHealth } from "../../core/ports";

/** Executes a job. Supplied by the ingestion module to avoid a circular import. */
export type IngestionHandler = (job: IngestionJob) => Promise<unknown>;

/**
 * Fallback queue used when no `REDIS_URL` is configured.
 *
 * Runs the job in-process, after the HTTP response has been sent, with a small
 * concurrency limit so a bulk re-index cannot saturate the event loop. Jobs are
 * lost on restart — an explicit, documented trade-off that keeps the app
 * deployable on hosts without Redis. Set `REDIS_URL` to get durability back.
 */
@Injectable()
export class InlineJobQueue implements JobQueuePort {
  private readonly logger = new Logger(InlineJobQueue.name);
  private readonly pending: IngestionJob[] = [];
  private handler?: IngestionHandler;
  private running = 0;

  private static readonly CONCURRENCY = 2;

  /** Wired once at bootstrap by `IngestionModule`. */
  registerHandler(handler: IngestionHandler): void {
    this.handler = handler;
    void this.drain();
  }

  async enqueueIngestion(job: IngestionJob): Promise<void> {
    this.pending.push(job);
    this.logger.warn(
      `No REDIS_URL configured — ingesting document ${job.documentId} in-process. ` +
        "Jobs are not durable in this mode.",
    );
    // Deliberately not awaited: the caller's HTTP request should not block on
    // embedding an entire document.
    void this.drain();
  }

  async health(): Promise<QueueHealth> {
    return {
      mode: "inline",
      healthy: true,
      detail:
        this.pending.length > 0
          ? `${this.pending.length} job(s) pending, ${this.running} running`
          : undefined,
    };
  }

  async close(): Promise<void> {
    this.pending.length = 0;
  }

  private async drain(): Promise<void> {
    if (!this.handler) return;

    while (
      this.pending.length > 0 &&
      this.running < InlineJobQueue.CONCURRENCY
    ) {
      const job = this.pending.shift();
      if (!job) break;

      this.running += 1;
      void this.handler(job)
        .catch((err: unknown) =>
          this.logger.error(
            `Inline ingestion failed for ${job.documentId}: ${errorDetail(err)}`,
          ),
        )
        .finally(() => {
          this.running -= 1;
          void this.drain();
        });
    }
  }
}
