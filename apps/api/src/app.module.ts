import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import type { IncomingMessage } from "node:http";
import {
  AppConfigModule,
  AppConfigService,
} from "./common/config/app-config.service";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { AgentModule } from "./modules/agent/agent.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ChatModule } from "./modules/chat/chat.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { EmbeddingsModule } from "./modules/embeddings/embeddings.module";
import { GithubModule } from "./modules/github/github.module";
import { HealthModule } from "./modules/health/health.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { ResumeModule } from "./modules/resume/resume.module";
import { SkillsModule } from "./modules/skills/skills.module";

@Module({
  imports: [
    // Config first: every other module's factory depends on validated config.
    AppConfigModule,

    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          // Correlation id: honour an upstream header when present so a trace
          // survives the hop from the Next.js frontend into the API.
          genReqId: (req: IncomingMessage) =>
            (req.headers["x-request-id"] as string) ?? randomUUID(),
          transport: config.isProduction
            ? undefined
            : { target: "pino-pretty", options: { singleLine: true } },
          // Secrets must never reach a log aggregator.
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "req.body.password",
              "res.headers['set-cookie']",
            ],
            censor: "[redacted]",
          },
          // Health probes fire constantly and would drown real traffic.
          autoLogging: {
            ignore: (req: IncomingMessage) =>
              req.url?.startsWith("/api/v1/health") ?? false,
          },
        },
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => [
        {
          name: "default",
          ttl: config.rateLimit.default.ttlMs,
          limit: config.rateLimit.default.limit,
        },
        {
          // Chat is the expensive endpoint — every request costs LLM tokens.
          name: "chat",
          ttl: config.rateLimit.chat.ttlMs,
          limit: config.rateLimit.chat.limit,
        },
      ],
    }),

    InfrastructureModule,
    AgentModule,

    AuthModule,
    ChatModule,
    DocumentsModule,
    EmbeddingsModule,
    ProjectsModule,
    SkillsModule,
    ResumeModule,
    AnalyticsModule,
    GithubModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
