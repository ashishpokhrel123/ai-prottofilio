import { Prisma } from "@prisma/client";
import {
  ConflictError,
  DependencyUnavailableError,
  InvalidInputError,
  ResourceNotFoundError,
} from "../../core/errors/domain.errors";
import { mapPrismaError } from "./prisma-error.mapper";

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("failed", {
    code,
    clientVersion: "5.22.0",
    meta,
  });
}

describe("mapPrismaError", () => {
  /**
   * Regression: an unreachable database used to surface as a bare 500, which
   * tells a client "your request is broken" instead of "this dependency is
   * down, retry" — and gives a load balancer nothing to act on.
   */
  it("maps a connection failure to a dependency outage", () => {
    const mapped = mapPrismaError(
      new Prisma.PrismaClientInitializationError(
        "Can't reach database server",
        "5.22.0",
      ),
    );

    expect(mapped).toBeInstanceOf(DependencyUnavailableError);
    expect(mapped?.code).toBe("DEPENDENCY_UNAVAILABLE");
    // The client message must not echo the connection string.
    expect(mapped?.message).not.toMatch(/postgres:\/\//);
  });

  it("maps an engine panic to a dependency outage", () => {
    expect(
      mapPrismaError(
        new Prisma.PrismaClientRustPanicError("panicked", "5.22.0"),
      ),
    ).toBeInstanceOf(DependencyUnavailableError);
  });

  // Label first so the test name reads well; the class is passed positionally.
  it.each<[string, string, new (...args: never[]) => Error]>([
    ["P2002", "unique constraint violation", ConflictError],
    ["P2003", "foreign key violation", InvalidInputError],
    ["P2025", "record not found", ResourceNotFoundError],
    ["P2021", "missing table", DependencyUnavailableError],
    ["P2022", "missing column", DependencyUnavailableError],
    ["P2024", "connection pool timeout", DependencyUnavailableError],
  ])("maps %s (%s)", (code, _label, expected) => {
    expect(mapPrismaError(knownError(code))).toBeInstanceOf(expected);
  });

  it("carries the conflicting target for a unique violation", () => {
    const mapped = mapPrismaError(knownError("P2002", { target: ["email"] }));

    expect(mapped?.context).toMatchObject({ target: ["email"] });
  });

  it("falls back to a dependency outage for an unrecognised code", () => {
    const mapped = mapPrismaError(knownError("P9999"));

    expect(mapped).toBeInstanceOf(DependencyUnavailableError);
    expect(mapped?.message).toContain("P9999");
  });

  it("maps a malformed query to invalid input", () => {
    expect(
      mapPrismaError(
        new Prisma.PrismaClientValidationError("bad args", {
          clientVersion: "5.22.0",
        }),
      ),
    ).toBeInstanceOf(InvalidInputError);
  });

  it.each([
    ["a plain Error", new Error("something else")],
    ["a string", "not an error"],
    ["null", null],
    ["undefined", undefined],
  ])("returns null for %s so callers can fall through", (_label, input) => {
    expect(mapPrismaError(input)).toBeNull();
  });
});
