import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.enableCors({ origin: process.env.APP_URL ?? "*", credentials: true });
  app.enableShutdownHooks();

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

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API ready on http://localhost:${port}/api  (docs: /api/docs)`);
}
void bootstrap();
