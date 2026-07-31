/**
 * Domain errors.
 *
 * The domain layer must not import from `@nestjs/common` — throwing
 * `NotFoundException` from a service couples business logic to HTTP. Instead
 * services throw these, and a single exception filter at the edge maps them
 * onto status codes.
 */

export type DomainErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "CONFLICT"
  | "DEPENDENCY_UNAVAILABLE"
  | "UNSUPPORTED";

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  protected constructor(
    message: string,
    readonly context?: Readonly<Record<string, unknown>>,
    options?: { cause?: unknown },
  ) {
    super(message, options as ErrorOptions);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** A requested entity does not exist. → 404 */
export class ResourceNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} "${id}" was not found.` : `${resource} not found.`,
      {
        resource,
        id,
      },
    );
  }
}

/** Input passed domain rules but not business rules. → 400 */
export class InvalidInputError extends DomainError {
  readonly code = "INVALID_INPUT" as const;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/** Credentials are missing or wrong. → 401 */
export class AuthenticationError extends DomainError {
  readonly code = "UNAUTHORIZED" as const;

  constructor(message = "Invalid credentials.") {
    super(message);
  }
}

/** The operation conflicts with current state. → 409 */
export class ConflictError extends DomainError {
  readonly code = "CONFLICT" as const;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * An external dependency (LLM, vector store, queue, GitHub) is unreachable or
 * misconfigured. → 503. Carries the dependency name so the filter can report
 * which one degraded without leaking connection strings.
 */
export class DependencyUnavailableError extends DomainError {
  readonly code = "DEPENDENCY_UNAVAILABLE" as const;

  constructor(
    readonly dependency: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, { dependency }, options);
  }
}

/** The requested capability is not supported (e.g. an unknown file type). → 422 */
export class UnsupportedOperationError extends DomainError {
  readonly code = "UNSUPPORTED" as const;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}

/** Narrows an unknown thrown value to a message, without leaking objects. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

/** Full stack when available — for logs only, never for HTTP responses. */
export function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}
