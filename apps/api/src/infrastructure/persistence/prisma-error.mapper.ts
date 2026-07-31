import { Prisma } from "@prisma/client";
import {
  ConflictError,
  DependencyUnavailableError,
  InvalidInputError,
  ResourceNotFoundError,
  type DomainError,
} from "../../core/errors/domain.errors";

/**
 * Translates Prisma exceptions into domain errors.
 *
 * Without this every database fault surfaced as a bare 500 — including a
 * simple "Postgres is unreachable", which is a *dependency* failure (503,
 * retryable, and a signal to a load balancer) rather than a bug in the
 * request. Prisma knowledge stays here in infrastructure; the HTTP filter
 * only ever sees domain errors.
 *
 * Returns `null` when the error is not from Prisma, so callers can fall
 * through to their own handling.
 */
export function mapPrismaError(err: unknown): DomainError | null {
  // Connection refused, auth failure, unreachable host, missing database.
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new DependencyUnavailableError(
      "postgres",
      "The database is unavailable. Please try again shortly.",
      { cause: err },
    );
  }

  // The engine crashed — the process is in an unknown state, but from the
  // caller's perspective the dependency is simply unusable.
  if (err instanceof Prisma.PrismaClientRustPanicError) {
    return new DependencyUnavailableError(
      "postgres",
      "The database engine failed. Please try again shortly.",
      { cause: err },
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return mapKnownRequestError(err);
  }

  // A malformed query is a programming error, but it reaches the client as
  // bad input often enough (unvalidated filters) to be worth distinguishing.
  if (err instanceof Prisma.PrismaClientValidationError) {
    return new InvalidInputError("The request could not be processed.");
  }

  return null;
}

function mapKnownRequestError(
  err: Prisma.PrismaClientKnownRequestError,
): DomainError {
  switch (err.code) {
    // Unique constraint violation.
    case "P2002":
      return new ConflictError("That record already exists.", {
        target: err.meta?.target,
      });

    // Foreign key constraint failed.
    case "P2003":
      return new InvalidInputError("A referenced record does not exist.");

    // An operation failed because the record was not found.
    case "P2025":
      return new ResourceNotFoundError("Record");

    // Table or column missing — the schema has drifted from the migrations.
    case "P2021":
    case "P2022":
      return new DependencyUnavailableError(
        "postgres",
        "The database schema is out of date. Run pending migrations.",
        { cause: err },
      );

    // Timed out fetching a connection from the pool.
    case "P2024":
      return new DependencyUnavailableError(
        "postgres",
        "The database is overloaded. Please try again shortly.",
        { cause: err },
      );

    default:
      return new DependencyUnavailableError(
        "postgres",
        `Database request failed (${err.code}).`,
        { cause: err },
      );
  }
}
