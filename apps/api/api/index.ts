import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { ExpressAdapter } from "@nestjs/platform-express";
import express from "express";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";

const server = express();
let isInitialized = false;

async function bootstrap() {
  if (isInitialized) return server;

  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(server),
    { bufferLogs: true }
  );

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.enableCors({ origin: process.env.APP_URL ?? "*", credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swagger = new DocumentBuilder()
    .setTitle("AI Portfolio API")
    .setDescription("Agentic RAG portfolio backend — chat, ingestion, sync, analytics.")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    "api/docs",
    app,
    SwaggerModule.createDocument(app, swagger),
  );

  await app.init();
  isInitialized = true;
  return server;
}

export default async function handler(req: any, res: any) {
  await bootstrap();
  server(req, res);
}
