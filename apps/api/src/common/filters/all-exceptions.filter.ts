import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AppConfigService } from "../config/app-config.service";
import { mapPrismaError } from "../../infrastructure/persistence/prisma-error.mapper";
import {
  errorDetail,
  isDomainError,
  type DomainErrorCode,
} from "../../core/errors/domain.errors";

/** Domain vocabulary → HTTP. The only place the two are allowed to meet. */
const STATUS_BY_CODE: Record<DomainErrorCode, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_INPUT: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  CONFLICT: HttpStatus.CONFLICT,
  DEPENDENCY_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  UNSUPPORTED: HttpStatus.UNPROCESSABLE_ENTITY,
};

export interface ErrorResponseBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string | string[];
  readonly path: string;
  readonly requestId?: string;
  readonly timestamp: string;
}

/**
 * Single exit point for every unhandled error.
 *
 * Two rules it enforces:
 *  - Domain errors carry their own status; nothing else has to translate them.
 *  - A 5xx never leaks its message to the client. Internal failure text
 *    routinely contains connection strings, table names and file paths; those
 *    belong in the logs, correlated by request id.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: AppConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.describe(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}: ${errorDetail(exception)}`,
      );
    } else {
      this.logger.debug(
        `${request.method} ${request.url} → ${status}: ${message}`,
      );
    }

    // A stream that already began cannot be turned into a JSON error body.
    if (response.headersSent) {
      response.end();
      return;
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      error,
      message:
        status >= HttpStatus.INTERNAL_SERVER_ERROR && this.config.isProduction
          ? "Internal server error"
          : message,
      path: request.url,
      // pino-http types req.id as string | number; normalise for the client.
      requestId: request.id === undefined ? undefined : String(request.id),
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    message: string | string[];
    error: string;
  } {
    // A database fault is a dependency failure (503), not a server bug (500).
    // Translating here keeps every DB-backed route honest without each one
    // having to catch Prisma errors itself.
    const domainError = isDomainError(exception)
      ? exception
      : mapPrismaError(exception);

    if (domainError) {
      return {
        status: STATUS_BY_CODE[domainError.code],
        message: domainError.message,
        error: domainError.code,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // Nest's ValidationPipe returns { message: string[], error, statusCode }.
      if (typeof payload === "object" && payload !== null) {
        const shaped = payload as {
          message?: string | string[];
          error?: string;
        };
        return {
          status,
          message: shaped.message ?? exception.message,
          error: shaped.error ?? HttpStatus[status] ?? "Error",
        };
      }

      return { status, message: String(payload), error: exception.name };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      error: "INTERNAL_ERROR",
    };
  }
}
