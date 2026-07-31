import { loadEnvFiles } from "./common/config/load-env";

// Must run before any module that reads configuration is imported.
loadEnvFiles();

import { Logger as NestLogger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import { AppConfigService } from "./common/config/app-config.service";
import { EnvValidationError } from "./common/config/env.schema";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(AppConfigService);

  // Shared with the e2e suite, so tests exercise the real configuration.
  configureApp(app, config);

  // Lets Nest run onModuleDestroy hooks on SIGTERM, so Prisma disconnects and
  // BullMQ drains instead of the platform hard-killing the container.
  app.enableShutdownHooks();

  if (!config.isProduction) {
    const swagger = new DocumentBuilder()
      .setTitle("AI Portfolio API")
      .setDescription(
        "Agentic RAG portfolio backend — chat, ingestion, sync, analytics.",
      )
      .setVersion("1.0")
      .addBearerAuth()
      .build();

    SwaggerModule.setup(
      "api/docs",
      app,
      SwaggerModule.createDocument(app, swagger),
    );
  }

  await app.listen(config.port, "0.0.0.0");

  logger.log(
    `API listening on port ${config.port} · env=${config.nodeEnv} · ` +
      `llm=${config.gemini.isConfigured ? config.gemini.llmModel : "NOT CONFIGURED"} · ` +
      `queue=${config.redis ? "bullmq" : "inline"}`,
    "Bootstrap",
  );
}

bootstrap().catch((err: unknown) => {
  // The pino logger may not exist yet if config validation failed, so this
  // path deliberately uses the plain Nest logger.
  const logger = new NestLogger("Bootstrap");

  if (err instanceof EnvValidationError) {
    logger.error(err.message);
    logger.error("Fix the environment and restart. See .env.example.");
  } else {
    logger.error(
      err instanceof Error ? (err.stack ?? err.message) : String(err),
    );
  }

  process.exit(1);
});
