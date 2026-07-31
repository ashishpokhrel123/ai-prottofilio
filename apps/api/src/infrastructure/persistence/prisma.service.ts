import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { AppConfigService } from "../../common/config/app-config.service";
import { withTimeout } from "../../common/utils/with-timeout";
import {
  DependencyUnavailableError,
  errorMessage,
} from "../../core/errors/domain.errors";

/**
 * Prisma client bound to the Nest lifecycle.
 *
 * Connection failure at boot is fatal in production: a process that cannot
 * reach its database should fail its healthcheck and let the platform restart
 * or roll back, rather than serve degraded traffic. In development it only
 * warns, so the frontend still runs before the DB is provisioned.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  constructor(private readonly config: AppConfigService) {
    super({
      datasources: { db: { url: config.database.url } },
      log:
        config.nodeEnv === "development"
          ? [
              { emit: "event", level: "warn" },
              { emit: "event", level: "error" },
            ]
          : [{ emit: "event", level: "error" }],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.connected = true;
      this.logger.log("Database connection established.");
    } catch (err) {
      const message = `Database connection failed: ${errorMessage(err)}`;

      if (this.config.isProduction) {
        throw new DependencyUnavailableError("postgres", message, {
          cause: err,
        });
      }

      this.logger.warn(
        `${message} — continuing in development. Run \`pnpm db:migrate\` once Postgres is up.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect().catch((err: unknown) =>
      this.logger.warn(`Error during disconnect: ${errorMessage(err)}`),
    );
  }

  /**
   * Cheap connectivity probe for the health endpoint.
   *
   * Bounded by an explicit timeout: when the database host is unreachable
   * (rather than actively refusing), Prisma's connect can block for far longer
   * than any platform's health-check window. A readiness probe that hangs is
   * worse than one that fails — the orchestrator learns nothing and may kill
   * the container mid-check.
   */
  async ping(timeoutMs = 2_000): Promise<boolean> {
    try {
      await withTimeout(this.$queryRaw`SELECT 1`, timeoutMs, "database ping");
      this.connected = true;
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }
}
