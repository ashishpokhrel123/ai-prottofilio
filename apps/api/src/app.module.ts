import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { configuration } from "./common/config/configuration";
import { PrismaModule } from "./common/config/prisma.module";
import { RedisModule } from "./common/config/redis.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ChatModule } from "./modules/chat/chat.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { EmbeddingsModule } from "./modules/embeddings/embeddings.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { SkillsModule } from "./modules/skills/skills.module";
import { ResumeModule } from "./modules/resume/resume.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { GithubModule } from "./modules/github/github.module";
import { AgentModule } from "./modules/agent/agent.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { singleLine: true } }
            : undefined,
        redact: ["req.headers.authorization"],
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL ?? 60) * 1000,
        limit: Number(process.env.RATE_LIMIT_MAX ?? 60),
      },
    ]),
    PrismaModule,
    RedisModule,
    AuthModule,
    AgentModule,
    ChatModule,
    DocumentsModule,
    EmbeddingsModule,
    ProjectsModule,
    SkillsModule,
    ResumeModule,
    AnalyticsModule,
    GithubModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
