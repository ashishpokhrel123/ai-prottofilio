import { loadEnvFiles } from "./common/config/load-env";

// Must run before any module that reads configuration is imported.
loadEnvFiles();

import { Logger as NestLogger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Express } from "express";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import { AppConfigService } from "./common/config/app-config.service";

/**
 * Serverless entrypoint — the Vercel Functions counterpart to `main.ts`.
 *
 * The difference from `main.ts` is not the app, it's the lifecycle. There is
 * no `listen`: the platform owns the socket and hands us `(req, res)`. And
 * there are no shutdown hooks: `enableShutdownHooks` would register SIGTERM
 * handlers that a frozen instance never receives, while making Prisma tear
 * down connections the next invocation expects to reuse.
 *
 * Everything else — prefix, versioning, validation, CORS, helmet — comes from
 * `configureApp`, the same function `main.ts` and the e2e suite use. There is
 * no second definition of how this API behaves.
 */

/**
 * Cached across invocations. A warm instance reuses the built Nest container
 * and, more importantly, the Prisma connection pool; rebuilding either per
 * request would exhaust Postgres connections within a handful of visitors.
 *
 * The promise itself is cached rather than the resolved app, so concurrent
 * requests arriving during a cold start await one bootstrap instead of racing
 * to start several.
 */
let cached: Promise<Express> | undefined;

async function bootstrap(): Promise<Express> {
  const server = express();

  const app: INestApplication = await NestFactory.create(
    AppModule,
    new ExpressAdapter(server),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  configureApp(app, app.get(AppConfigService));

  // Wires the Nest router into the Express instance without binding a port.
  await app.init();

  return server;
}

export function getServer(): Promise<Express> {
  if (!cached) {
    cached = bootstrap().catch((err: unknown) => {
      // Clear the cache so the next request retries instead of replaying a
      // rejected promise forever — a transient DB blip at cold start would
      // otherwise poison every subsequent invocation on this instance.
      cached = undefined;

      new NestLogger("Serverless").error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
      throw err;
    });
  }

  return cached;
}

/** Vercel Function handler. */
export default async function handler(
  req: express.Request,
  res: express.Response,
): Promise<void> {
  const server = await getServer();
  server(req, res);
}
