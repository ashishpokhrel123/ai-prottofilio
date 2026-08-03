"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { LogEntry } from "../useActivityLog";

const TEXT_STYLES = {
  error: "text-status-error",
  success: "text-signal",
  info: "text-zinc-300",
} as const;

interface ActivityLogProps {
  entries: LogEntry[];
}

export function ActivityLog({ entries }: ActivityLogProps) {
  return (
    <section className="panel space-y-2 p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
        <span
          className="h-2 w-2 animate-pulse rounded-full bg-signal"
          aria-hidden="true"
        />
        Activity
      </h2>

      <div
        // Announces new entries to screen readers without stealing focus.
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="h-40 space-y-1 overflow-y-auto border border-panel-line bg-panel-sunken p-3 font-mono text-[11px]"
      >
        {entries.length === 0 ? (
          <p className="text-zinc-600">No events yet.</p>
        ) : (
          entries.map((entry) => (
            <p key={entry.id} className="flex items-start gap-1.5">
              {entry.kind === "success" && (
                <CheckCircle2
                  size={12}
                  className="mt-0.5 shrink-0 text-signal"
                  aria-hidden="true"
                />
              )}
              {entry.kind === "error" && (
                <AlertCircle
                  size={12}
                  className="mt-0.5 shrink-0 text-status-error"
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
