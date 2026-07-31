"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { LogEntry } from "../useActivityLog";

const TEXT_STYLES = {
  error: "text-red-300",
  success: "text-emerald-200",
  info: "text-slate-300",
} as const;

interface ActivityLogProps {
  entries: LogEntry[];
}

export function ActivityLog({ entries }: ActivityLogProps) {
  return (
    <section className="glass-card space-y-2 rounded-2xl p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span
          className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"
          aria-hidden="true"
        />
        Activity
      </h2>

      <div
        // Announces new entries to screen readers without stealing focus.
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="h-40 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-[11px]"
      >
        {entries.length === 0 ? (
          <p className="text-slate-600">No events yet.</p>
        ) : (
          entries.map((entry) => (
            <p key={entry.id} className="flex items-start gap-1.5">
              {entry.kind === "success" && (
                <CheckCircle2
                  size={12}
                  className="mt-0.5 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
              )}
              {entry.kind === "error" && (
                <AlertCircle
                  size={12}
                  className="mt-0.5 shrink-0 text-red-400"
                  aria-hidden="true"
                />
              )}
              <span className={TEXT_STYLES[entry.kind]}>
                [{entry.timestamp}] {entry.message}
              </span>
            </p>
          ))
        )}
      </div>
    </section>
  );
}
