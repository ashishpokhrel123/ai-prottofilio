"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { TraceStage, TraceStageName } from "@ai-portfolio/shared";

/**
 * The retrieval pipeline, as it actually ran.
 *
 * This is the part of the portfolio that cannot be copied from a template.
 * Anyone can ship a dark chat UI; showing that the answer came from a hybrid
 * search over 2048-dimensional vectors, narrowed by a cross-encoder, and
 * checked against a confidence floor — with the real numbers — is the thing
 * that demonstrates the system behind it.
 *
 * Two rules govern everything below:
 *
 *  1. **Nothing is invented.** Every number rendered here arrived in a `trace`
 *     event the API measured. A stage the API did not report is not drawn.
 *     There are no placeholder latencies, no "~", no estimated counts. A trace
 *     that fabricates is worse than no trace, because its entire value is that
 *     a reader can trust it as a record of the run.
 *
 *  2. **It is never load-bearing.** The answer reads perfectly with this panel
 *     collapsed, and renders unchanged if no trace event ever arrives.
 */

const STAGE_LABELS: Record<TraceStageName, string> = {
  detect: "intent",
  plan: "plan",
  retrieve: "retrieve",
  rerank: "rerank",
  tool: "tool",
  synthesize: "generate",
};

/** Fixed order, so the trace reads as a pipeline rather than an event log. */
const STAGE_ORDER: TraceStageName[] = [
  "detect",
  "plan",
  "retrieve",
  "rerank",
  "tool",
  "synthesize",
];

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

/**
 * The counters worth reading, in priority order.
 *
 * Returned as pairs rather than a formatted string so the row can lay them out
 * on a baseline grid and truncate from the end on a narrow viewport.
 */
function metrics(stage: TraceStage): { key: string; value: string }[] {
  const d = stage.detail;
  if (!d) return [];

  const out: { key: string; value: string }[] = [];

  if (d.dimensions !== undefined) out.push({ key: "dim", value: `${d.dimensions}` });

  // Candidates→kept is the re-ranker's whole story, so it is rendered as the
  // narrowing it represents rather than as two unrelated counters.
  if (d.candidates !== undefined && d.kept !== undefined) {
    out.push({ key: "hits", value: `${d.candidates}→${d.kept}` });
  } else if (d.candidates !== undefined) {
    out.push({ key: "hits", value: `${d.candidates}` });
  }

  if (d.tools?.length) out.push({ key: "via", value: d.tools.join(" ") });

  return out;
}

/** A stage with no `ms` has not finished; the API sets it on completion. */
function isRunning(stage: TraceStage): boolean {
  return stage.ms === undefined;
}

export function PipelineTrace({
  stages,
  streaming,
}: {
  stages: readonly TraceStage[];
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (stages.length === 0) return null;

  // Sorted into pipeline order, but stably — a re-planned second iteration
  // legitimately produces two `tool` stages and both belong in the trace.
  const ordered = [...stages].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage),
  );

  const total = ordered.reduce((sum, s) => sum + (s.ms ?? 0), 0);

  // The confidence gate's verdict, read off whichever stage reported it.
  const gate = ordered.find((s) => s.detail?.topSimilarity !== undefined)
    ?.detail;

  return (
    <div
      className={`mt-4 ${open ? "overflow-hidden rounded-xl border border-panel-line" : ""}`}
    >
      {/*
        Collapsed, this is one muted line — not a panel.

        It previously carried a bordered container, five stage pips and a
        similarity readout while still collapsed, which made a diagnostic the
        reader hadn't asked for compete with the answer above it. The trace is
        worth showing; it is not worth showing first. Everything except "how
        long did this take" now lives behind the click.
      */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`group flex w-full items-center gap-1.5 text-left transition-colors ${
          open ? "px-3 py-2 hover:bg-panel-hover" : "py-0.5"
        }`}
      >
        <ChevronRight
          size={11}
          className={`shrink-0 text-zinc-500 transition-transform duration-200 group-hover:text-zinc-300 ${
            open ? "rotate-90" : ""
          }`}
        />

        {/* Tracking comes from the `meta` step now, not an arbitrary value —
            0.14em was tuned against Roboto Mono and is too loose for Google
            Sans Code, which is the wider face of the two. */}
        <span className="font-mono text-meta font-medium uppercase text-zinc-500 transition-colors group-hover:text-zinc-300">
          {streaming ? "running" : "trace"}
        </span>

        {/* While streaming the total is still climbing, so rendering it would
            mean showing a number that is knowably wrong. */}
        {!streaming && total > 0 && (
          <span className="font-mono text-meta text-zinc-500 transition-colors group-hover:text-zinc-300">
            {formatMs(total)}
          </span>
        )}
      </button>

      {/* ── Expanded: one row per measured stage ── */}
      {open && (
        <div className="border-t border-panel-line">
          {ordered.map((stage, i) => {
            const running = isRunning(stage);
            const cells = metrics(stage);

            return (
              <div
                key={`${stage.stage}-${i}`}
                className="flex items-baseline gap-3 border-b border-panel-line/60 px-3 py-2 last:border-b-0"
              >
                {/* Stage name — fixed width so the columns line up vertically
                    and the trace reads as a table, not a paragraph. */}
                <span
                  className={`w-16 shrink-0 font-mono text-micro ${
                    running ? "text-signal" : "text-zinc-300"
                  }`}
                >
                  {STAGE_LABELS[stage.stage]}
                </span>

                {/* Label — the API's own word for what happened. Sans, not
                    mono: it is prose the API wrote, not a measurement, and
                    setting it in mono was what made the whole trace read as a
                    log dump rather than a table. */}
                <span className="min-w-0 flex-1 truncate text-micro text-zinc-400">
                  {stage.label ?? ""}
                </span>

                {cells.map((cell) => (
                  <span
                    key={cell.key}
                    className="hidden shrink-0 font-mono text-micro text-zinc-400 sm:inline"
                  >
                    <span className="text-zinc-500">{cell.key} </span>
                    {cell.value}
                  </span>
                ))}

                <span className="w-14 shrink-0 text-right font-mono text-micro">
                  {running ? (
                    <span className="scan inline-block h-px w-8 bg-panel-line align-middle" />
                  ) : (
                    <span className="text-zinc-400">{formatMs(stage.ms!)}</span>
                  )}
                </span>
              </div>
            );
          })}

          {/* ── Confidence gate ──
              Rendered only when retrieval actually reported a similarity.
              This is the one place the pipeline makes a *decision*, so it gets
              a real bar rather than another number in a row. */}
          {gate?.topSimilarity !== undefined &&
            gate.threshold !== undefined && (
              <div className="border-t border-panel-line px-3 py-2.5">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="label-meta">confidence gate</span>
                  <span
                    className={`font-mono text-micro ${
                      gate.grounded ? "text-signal" : "text-status-warn"
                    }`}
                  >
                    {gate.grounded ? "passed" : "below floor"}
                  </span>
                </div>

                <div className="relative h-1.5 w-full bg-panel-line/60">
                  <div
                    className="absolute inset-y-0 left-0 origin-left animate-bar-fill"
                    style={{
                      width: `${Math.min(100, gate.topSimilarity * 100)}%`,
                      /* The theme variables are bare RGB channels ("66 133
                         244") so Tailwind's `/<alpha-value>` can compose, which
                         means a raw `var(--signal)` here was an invalid colour
                         and the bar painted transparent. */
                      background: gate.grounded
                        ? "rgb(var(--signal))"
                        : "rgb(var(--status-warn))",
                    }}
                  />
                  {/* The floor, drawn on the same axis. Two numbers in a
                      sentence require the reader to do the comparison; one bar
                      and a tick shows it. */}
                  <div
                    className="absolute inset-y-[-3px] w-px bg-zinc-500"
                    style={{ left: `${Math.min(100, gate.threshold * 100)}%` }}
                    title={`RAG_MIN_SIMILARITY = ${gate.threshold}`}
                  />
                </div>

                <div className="mt-1.5 flex justify-between font-mono text-meta text-zinc-400">
                  <span>top similarity {gate.topSimilarity.toFixed(3)}</span>
                  <span>floor {gate.threshold.toFixed(2)}</span>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
