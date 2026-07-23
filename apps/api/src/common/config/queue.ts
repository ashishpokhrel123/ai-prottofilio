import IORedis from "ioredis";
import { Queue } from "bullmq";

export const INGESTION_QUEUE = "ingestion";

export interface IngestionJob {
  documentId: string;
  filePath?: string;
  mimeType?: string;
  text?: string;
}

let connection: IORedis | null = null;
export function redisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      {
        maxRetriesPerRequest: null,
      },
    );
    connection.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[redis:queue] connection error:", err.message);
    });
  }
  return connection;
}

let queue: Queue<IngestionJob> | null = null;
export function ingestionQueue(): Queue<IngestionJob> {
  if (!queue) {
    queue = new Queue<IngestionJob>(INGESTION_QUEUE, {
      connection: redisConnection(),
    });
  }
  return queue;
}
