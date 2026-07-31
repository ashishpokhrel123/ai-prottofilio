import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { AppConfigService } from "../../common/config/app-config.service";
import { withTimeout } from "../../common/utils/with-timeout";
import {
  DependencyUnavailableError,
  errorMessage,
} from "../../core/errors/domain.errors";
import type { IngestionJob, JobQueuePort, QueueHealth } from "../../core/ports";

export const INGESTION_QUEUE = "ingestion";

/**
 * Shared ioredis factory. BullMQ requires `maxRetriesPerRequest: null` on the
 * connection it owns, and both the API and the worker process must construct
 * the client identically or jobs silently fail to be picked up.
 */
export function createRedisConnection(url: string): Redis {
  const client = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });

  // An 'error' event with no listener is rethrown as an uncaught exception and
  // takes the process down. Always attach one.
  client.on("error", (err) => {
    // eslint-disable-next-line no-console -- may fire before the logger exists
    console.error(`[redis] ${err.message}`);
  });

  return client;
}

/** Redis-backed queue. The production path: uploads return immediately. */
@Injectable()
export class BullMqJobQueue implements JobQueuePort, OnModuleDestroy {
  private readonly logger = new Logger(BullMqJobQueue.name);
  private readonly connection: Redis;
  private readonly queue: Queue<IngestionJob>;

  constructor(config: AppConfigService) {
    const redis = config.redis;
    if (!redis) {
      throw new Error(
        "BullMqJobQueue requires REDIS_URL. Bind InlineJobQueue instead.",
      );
    }

    this.connection = createRedisConnection(redis.url);
    this.queue = new Queue<IngestionJob>(INGESTION_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });

    // BullMQ duplicates the connection internally for blocking commands, and
    // those duplicates do not inherit the listener attached in
    // `createRedisConnection`. Without this, an unreachable Redis dumps raw
    // ioredis stack traces to stderr on every retry — and an 'error' event
    // with no listener is fatal in Node.
    this.queue.on("error", (err) =>
      this.logger.warn(`Queue connection error: ${err.message}`),
    );
  }

  async enqueueIngestion(job: IngestionJob): Promise<void> {
    try {
      await this.queue.add("ingest", job, {
        jobId: `ingest:${job.documentId}`,
      });
      this.logger.log(`Queued ingestion for document ${job.documentId}`);
    } catch (err) {
      throw new DependencyUnavailableError(
        "redis",
        `Could not queue ingestion job: ${errorMessage(err)}`,
        { cause: err },
      );
    }
  }

  async health(): Promise<QueueHealth> {
    try {
      // Bounded: ioredis retries DNS resolution indefinitely for an
      // unreachable host, so an unguarded ping never settles and stalls the
      // readiness probe that calls it.
      await withTimeout(this.connection.ping(), 2_000, "redis ping");
      return { mode: "queued", healthy: true };
    } catch (err) {
      return { mode: "queued", healthy: false, detail: errorMessage(err) };
    }
  }

  async close(): Promise<void> {
    await this.queue.close().catch(() => undefined);
    await this.connection.quit().catch(() => undefined);
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }
}
