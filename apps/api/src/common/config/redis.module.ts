import { Global, Module } from "@nestjs/common";
import IORedis from "ioredis";

export const REDIS = Symbol("REDIS");

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => {
        const client = new IORedis(
          process.env.REDIS_URL ?? "redis://localhost:6379",
          {
            maxRetriesPerRequest: null,
            // Don't connect at construction time — avoids a crash during
            // bootstrap when Redis is unreachable (e.g. serverless cold start).
            lazyConnect: true,
            enableOfflineQueue: false,
          },
        );
        // An 'error' event with no listener is thrown as an uncaught
        // exception and kills the function. Always attach a handler.
        client.on("error", (err) => {
          // eslint-disable-next-line no-console
          console.error("[redis] connection error:", err.message);
        });
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
