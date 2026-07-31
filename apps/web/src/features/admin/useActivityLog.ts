"use client";

import { useCallback, useState } from "react";

export type LogKind = "info" | "success" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  kind: LogKind;
  message: string;
}

const MAX_ENTRIES = 30;

/**
 * Bounded, newest-first activity log for the admin console.
 *
 * Capped so a long session cannot grow the array without limit, and keyed by
 * id rather than array index — index keys make React reuse the wrong DOM node
 * when entries are prepended.
 */
export function useActivityLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  const append = useCallback((message: string, kind: LogKind = "info") => {
    setEntries((current) =>
      [
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toLocaleTimeString(),
          kind,
          message,
        },
        ...current,
      ].slice(0, MAX_ENTRIES),
    );
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  return { entries, append, clear };
}
