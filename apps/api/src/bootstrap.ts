import { ValidationPipe, VersioningType } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import helmet from "helmet";
import type { AppConfigService } from "./common/config/app-config.service";

/**
 * Applies every cross-cutting concern to a Nest application.
 *
 * Shared by `main.ts` and the end-to-end tests so the suite exercises the same
 * prefix, versioning, validation and CORS rules as production. Configuring
 * these separately in tests is how a suite ends up passing against an app that
 * doesn't exist.
 */
export function configureApp(
  app: INestApplication,
  config: AppConfigService,
): INestApplication {
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  // CSP is off: this API serves JSON and the Swagger UI, and a restrictive
  // default policy breaks the latter.
  app.use(
    helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }),
  );

  // Explicit allow-list. `origin: "*"` with `credentials: true` is a
  // combination browsers reject outright, and it defeats the point of CORS.
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Validation messages can echo submitted values; keep them out of prod.
      disableErrorMessages: config.isProduction,
    }),
  );

  return app;
}
