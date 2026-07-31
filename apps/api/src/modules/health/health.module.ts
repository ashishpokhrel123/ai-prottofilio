import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Injectable,
  Module,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { AppConfigService } from "../../common/config/app-config.service";
import { safeCheck } from "../../common/utils/with-timeout";
import { JOB_QUEUE_PORT, LLM_PORT } from "../../core/ports";
import type { JobQueuePort, LlmPort } from "../../core/ports";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";

/** Upper bound per dependency check. Must stay well under any probe timeout. */
const CHECK_TIMEOUT_MS = 2_500;

type CheckStatus = "up" | "down" | "not_configured";

export interface HealthReport {
  readonly status: "ok" | "degraded";
  readonly uptimeSeconds: number;
  readonly version: string;
  readonly checks: Readonly<
    Record<string, { status: CheckStatus; detail?: string }>
  >;
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    @Inject(JOB_QUEUE_PORT) private readonly queue: JobQueuePort,
  ) {}

  /** Liveness: is the process itself running? Never touches a dependency. */
  live(): { status: "ok"; uptimeSeconds: number } {
    return { status: "ok", uptimeSeconds: this.uptime() };
  }

  /**
   * Readiness: should this instance receive traffic?
   *
   * Only the database is load-bearing. A missing LLM key or absent Redis
   * degrades features but still serves requests, so neither should cause a
   * platform to pull the instance out of rotation.
   */
  async ready(): Promise<HealthReport> {
    // Every check is independently bounded. A probe that hangs tells the
    // orchestrator nothing and may be killed mid-check — always answer, even
    // if the answer is "down".
    const [database, queue] = await Promise.all([
      safeCheck(() => this.prisma.ping(), false, CHECK_TIMEOUT_MS, "database"),
      safeCheck(
        () => this.queue.health(),
        { mode: "queued", healthy: false, detail: "health check timed out" },
        CHECK_TIMEOUT_MS,
        "queue",
      ),
    ]);

    return {
      status: database ? "ok" : "degraded",
      uptimeSeconds: this.uptime(),
      version: process.env.npm_package_version ?? "unknown",
      checks: {
        database: { status: database ? "up" : "down" },
        llm: {
          status: this.llm.isConfigured ? "up" : "not_configured",
          detail: this.llm.model,
        },
        queue: {
          status: queue.healthy ? "up" : "down",
          detail: queue.mode === "inline" ? "in-process (no Redis)" : "bullmq",
        },
      },
    };
  }

  private uptime(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }
}

@ApiTags("health")
@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Liveness probe — process is running." })
  live() {
    return this.health.live();
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe — dependencies are reachable." })
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthReport> {
    const report = await this.health.ready();

    // The status code is set directly rather than by throwing: an exception
    // would be reshaped by the global filter into a generic error body, and
    // a health endpoint whose response doesn't say *which* dependency failed
    // is useless for diagnosis. A non-2xx is still what platform probes read.
    res.status(
      report.status === "ok" ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return report;
  }
}

@Module({
  providers: [HealthService],
  controllers: [HealthController],
})
export class HealthModule {}
