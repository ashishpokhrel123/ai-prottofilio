"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  CheckCircle2,
  Database,
  Gauge,
  ListChecks,
  RefreshCw,
  Server,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  formatUptime,
  probeHealth,
  type CheckStatus,
  type HealthProbe,
} from "@/lib/api/health";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const POLL_INTERVAL_MS = 15_000;

/**
 * Presentation for each dependency the API reports.
 *
 * Keyed by the API's own check names. Anything the API adds later still
 * renders, using the fallback below — a status page that silently omits a new
 * dependency is worse than one that shows it plainly.
 */
const CHECK_META: Record<
  string,
  { label: string; icon: LucideIcon; description: string }
> = {
  database: {
    label: "Database",
    icon: Database,
    description: "PostgreSQL with pgvector — stores content and embeddings.",
  },
  llm: {
    label: "Language model",
    icon: Brain,
    description: "Generates answers and embeds text for retrieval.",
  },
  queue: {
    label: "Ingestion queue",
    icon: ListChecks,
    description: "Processes uploaded documents into searchable chunks.",
  },
};

const FALLBACK_META = { icon: Server, description: "" };

/**
 * "Operational" is a claim the API now earns: the language-model check calls
 * the provider rather than just confirming a key string exists, so `up` means
 * verified everywhere it appears.
 */
function describeStatus(status: CheckStatus): string {
  if (status === "not_configured") return "Not configured";
  if (status === "down") return "Unavailable";
  return "Operational";
}

const STATUS_STYLES: Record<
  CheckStatus,
  { dot: string; text: string; icon: LucideIcon }
> = {
  up: {
    dot: "bg-signal",
    text: "text-signal",
    icon: CheckCircle2,
  },
  not_configured: {
    dot: "bg-status-warn",
    text: "text-status-warn",
    icon: AlertTriangle,
  },
  down: { dot: "bg-status-error", text: "text-status-error", icon: XCircle },
};

export function StatusDashboard() {
  const [probe, setProbe] = useState<HealthProbe | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);

  // Held in a ref so an in-flight request from a previous tick can be aborted
  // without the callback depending on it and re-creating the interval.
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setIsRefreshing(true);
    try {
      setProbe(await probeHealth(controller.signal));
    } catch {
      // Only an abort reaches here; probeHealth resolves for every other case.
    } finally {
      if (!controller.signal.aborted) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
      inFlight.current?.abort();
    };
  }, [refresh]);

  const report = probe?.report ?? null;
  const unreachable = probe !== null && report === null;

  const overall: CheckStatus = unreachable
    ? "down"
    : report === null
      ? "up"
      : report.status === "ok"
        ? "up"
        : "down";

  const OverallIcon = STATUS_STYLES[overall].icon;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <Link
        href="/"
        className="group mb-8 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <ArrowLeft
          size={13}
          className="transition-transform duration-200 group-hover:-translate-x-0.5"
        />
        Back to portfolio
      </Link>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
            System status
          </h1>
          <p className="text-sm text-zinc-400">
            Live health of the services behind this portfolio.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 border border-panel-line bg-panel-raised px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:border-panel-line hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-signal/30 disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              className={isRefreshing ? "animate-spin" : undefined}
              aria-hidden="true"
            />
            {isRefreshing ? "Checking…" : "Refresh"}
          </button>
        </div>
      </header>

      {/* Overall banner */}
      <section
        aria-live="polite"
        className="panel mb-6 flex items-center gap-4 p-5 shadow-raised"
      >
        <span className="relative flex h-3 w-3 shrink-0">
          {overall === "up" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal/60" />
          )}
          <span
            className={`relative inline-flex h-3 w-3 rounded-full ${STATUS_STYLES[overall].dot}`}
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold text-zinc-100">
            <OverallIcon
              size={16}
              className={STATUS_STYLES[overall].text}
              aria-hidden="true"
            />
            {probe === null
              ? "Checking services…"
              : unreachable
                ? "API unreachable"
                : overall === "up"
                  ? "All systems operational"
                  : "Degraded performance"}
          </p>

          {probe?.error && (
            <p className="mt-1 text-xs leading-relaxed text-status-error">
              {probe.error}
            </p>
          )}
        </div>
      </section>

      {/* Per-dependency checks */}
      <section className="space-y-3">
        {report === null
          ? Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="panel h-[76px] animate-pulse"
              />
            ))
          : Object.entries(report.checks).map(([name, check]) => {
              const meta = CHECK_META[name];
              const Icon = meta?.icon ?? FALLBACK_META.icon;
              const styles = STATUS_STYLES[check.status];

              return (
                <article
                  key={name}
                  className="panel flex items-center gap-4 p-4 shadow-raised sm:p-5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-panel-line bg-panel-raised text-zinc-400">
                    <Icon size={18} aria-hidden="true" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="font-medium capitalize text-zinc-100">
                      {meta?.label ?? name}
                    </h2>
                    <p className="truncate text-xs text-zinc-500">
                      {check.detail ??
                        meta?.description ??
                        FALLBACK_META.description}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${styles.dot}`}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-xs font-medium ${styles.text} whitespace-nowrap`}
                    >
                      {describeStatus(check.status)}
                    </span>
                  </div>
                </article>
              );
            })}
      </section>

      {/* Metrics */}
      {report && (
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric
            icon={Gauge}
            label="Response time"
            value={`${probe?.latencyMs ?? 0} ms`}
          />
          <Metric
            icon={Server}
            label="Uptime"
            value={formatUptime(report.uptimeSeconds)}
          />
          <Metric
            icon={CheckCircle2}
            label="Version"
            value={report.version === "unknown" ? "—" : report.version}
          />
        </section>
      )}

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
        <span>
          {probe
            ? `Last checked ${new Date(probe.checkedAt).toLocaleTimeString()}`
            : "Not yet checked"}
        </span>
        <span>Refreshes every {POLL_INTERVAL_MS / 1000}s</span>
      </footer>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="panel p-4">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
        <Icon size={12} aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 font-mono text-lg text-zinc-100">{value}</p>
    </div>
  );
}
