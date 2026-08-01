import { apiUrl } from "./config";

export type CheckStatus = "up" | "down" | "not_configured";

export interface HealthCheck {
  readonly status: CheckStatus;
  readonly detail?: string;
}

/** Mirrors `HealthReport` in the API's health module. */
export interface HealthReport {
  readonly status: "ok" | "degraded";
  readonly uptimeSeconds: number;
  readonly version: string;
  readonly checks: Readonly<Record<string, HealthCheck>>;
}

export interface HealthProbe {
  /** Null only when the API could not be reached at all. */
  readonly report: HealthReport | null;
  /** Round-trip time in milliseconds, measured in the browser. */
  readonly latencyMs: number;
  readonly error: string | null;
  readonly checkedAt: number;
}

/**
 * Fetches the readiness report.
 *
 * Deliberately not built on `apiRequest`: that throws on any non-2xx, and this
 * endpoint answers **503 with a body** when a dependency is down. Throwing
 * away that body would discard the only thing worth showing — a status page
 * that says "unreachable" when the API is up and merely degraded is worse than
 * no status page.
 */
export async function probeHealth(signal?: AbortSignal): Promise<HealthProbe> {
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const elapsed = (): number =>
    Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        startedAt,
    );

  let response: Response;
  try {
    response = await fetch(apiUrl("/health/ready"), {
      signal,
      cache: "no-store",
    });
  } catch {
    // A network failure here is indistinguishable from a CORS rejection —
    // the browser withholds the detail from scripts on purpose.
    return {
      report: null,
      latencyMs: elapsed(),
      error:
        "The API could not be reached. It may be down, still starting, or " +
        "rejecting this origin via CORS.",
      checkedAt: Date.now(),
    };
  }

  const latencyMs = elapsed();
  const text = await response.text();

  let report: HealthReport;
  try {
    report = JSON.parse(text) as HealthReport;
  } catch {
    return {
      report: null,
      latencyMs,
      error: `The API answered ${response.status} but the body was not a health report.`,
      checkedAt: Date.now(),
    };
  }

  return { report, latencyMs, error: null, checkedAt: Date.now() };
}

/** "3d 4h 12m" — the largest two units that are non-zero. */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const units: Array<[number, string]> = [
    [86_400, "d"],
    [3_600, "h"],
    [60, "m"],
  ];

  const parts: string[] = [];
  let rest = seconds;

  for (const [size, label] of units) {
    const value = Math.floor(rest / size);
    if (value > 0 || parts.length > 0) parts.push(`${value}${label}`);
    rest %= size;
    if (parts.length === 2) break;
  }

  return parts.join(" ");
}
