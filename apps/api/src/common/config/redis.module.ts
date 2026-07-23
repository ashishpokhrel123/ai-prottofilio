import { Global, Module } from "@nestjs/common";
import IORedis from "ioredis";

export const REDIS = Symbol("REDIS");

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () =>
        new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
          maxRetriesPerRequest: null,
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
