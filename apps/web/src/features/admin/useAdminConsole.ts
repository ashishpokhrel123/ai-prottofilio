"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  adminApi,
  type AnalyticsSummary,
  type DocumentRow,
} from "@/lib/api/admin";
import { useActivityLog } from "./useActivityLog";

/** Identifies which action is in flight, so only that control shows a spinner. */
export type BusyKey =
  "github" | "skills" | "reindex" | "upload" | `doc-${string}` | null;

export interface AdminConsole {
  documents: DocumentRow[];
  analytics: AnalyticsSummary | null;
  busy: BusyKey;
  log: ReturnType<typeof useActivityLog>;
  refresh: () => Promise<void>;
  refreshAnalytics: () => Promise<void>;
  uploadDocument: (form: FormData) => Promise<void>;
  reindexDocument: (id: string) => Promise<void>;
  deleteDocument: (id: string, title: string) => Promise<void>;
  syncGithub: () => Promise<void>;
  reindexAll: () => Promise<void>;
  extractSkills: () => Promise<void>;
}

/**
 * All admin console behaviour, extracted from what was a single 487-line
 * component. Keeping data flow here leaves the components purely presentational
 * and independently testable.
 */
export function useAdminConsole(
  token: string,
  onUnauthorized: () => void,
): AdminConsole {
  const log = useActivityLog();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [busy, setBusy] = useState<BusyKey>(null);

  /**
   * Wraps every mutation: sets the busy key, reports the outcome to the log,
   * and signs the user out on 401 rather than leaving a dead console on screen.
   */
  const run = useCallback(
    async <T>(
      key: Exclude<BusyKey, null>,
      action: () => Promise<T>,
      describe: (result: T) => string,
      failureLabel: string,
    ): Promise<T | undefined> => {
      setBusy(key);
      try {
        const result = await action();
        log.append(describe(result), "success");
        return result;
      } catch (err) {
        if (err instanceof ApiError && err.isUnauthorized) {
          log.append("Session expired — please sign in again.", "error");
          onUnauthorized();
          return undefined;
        }
        log.append(
          `${failureLabel}: ${err instanceof Error ? err.message : "unknown error"}`,
          "error",
        );
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [log, onUnauthorized],
  );

  const refresh = useCallback(async () => {
    try {
      setDocuments(await adminApi.listDocuments(token));
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) {
        onUnauthorized();
        return;
      }
      log.append(
        `Could not load documents: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
      );
    }
  }, [token, log, onUnauthorized]);

  const refreshAnalytics = useCallback(async () => {
    try {
      setAnalytics(await adminApi.analytics(token));
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) onUnauthorized();
      // Analytics is a dashboard nicety; a failure here isn't worth a log line
      // on every mount when the database is still warming up.
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void refresh();
    void refreshAnalytics();
  }, [refresh, refreshAnalytics]);

  const uploadDocument = useCallback(
    async (form: FormData) => {
      await run(
        "upload",
        () => adminApi.uploadDocument(token, form),
        () => "Document uploaded and queued for ingestion.",
        "Upload failed",
      );
      await refresh();
    },
    [run, token, refresh],
  );

  const reindexDocument = useCallback(
    async (id: string) => {
      await run(
        `doc-${id}`,
        () => adminApi.reindexDocument(token, id),
        () => "Document re-queued for ingestion.",
        "Re-index failed",
      );
      await refresh();
    },
    [run, token, refresh],
  );

  const deleteDocument = useCallback(
    async (id: string, title: string) => {
      await run(
        `doc-${id}`,
        () => adminApi.deleteDocument(token, id),
        () => `Deleted "${title}".`,
        "Delete failed",
      );
      await refresh();
    },
    [run, token, refresh],
  );

  const syncGithub = useCallback(async () => {
    log.append("Triggering GitHub sync…");

    const response = await run(
      "github",
      () => adminApi.syncGithub(token),
      (r) =>
        `GitHub sync complete — ${r.indexed} repos indexed, ${r.skipped} skipped.`,
      "GitHub sync failed",
    );

    // A partial sync is the common failure mode (usually an embedding rate
    // limit), and silently reporting only the successes would hide it.
    if (response && response.failed.length > 0) {
      log.append(
        `${response.failed.length} repo(s) failed to index: ${response.failed.join(", ")}. Re-run the sync to retry them.`,
        "error",
      );
    }

    await refresh();
  }, [run, token, refresh, log]);

  const reindexAll = useCallback(async () => {
    log.append("Queueing a full re-index…");

    const response = await run(
      "reindex",
      () => adminApi.reindexAll(token),
      (r) => `Re-index queued for ${r.queued} document(s).`,
      "Re-index failed",
    );

    // Synced documents have no stored file to re-read. Saying so beats
    // leaving them silently stuck at PENDING.
    if (response && response.skipped > 0) {
      log.append(
        `Skipped ${response.skipped} synced document(s) — run Sync GitHub to refresh them: ` +
          response.skippedTitles.join(", "),
        "info",
      );
    }
  }, [run, token, log]);

  const extractSkills = useCallback(async () => {
    log.append("Extracting skills from GitHub and the resume…");

    const response = await run(
      "skills",
      () => adminApi.extractSkills(token),
      () => "Skill extraction finished.",
      "Skill extraction failed",
    );

    // Per-source detail: one source succeeding while the other has nothing to
    // work with is the common case, and a single summary line hides that.
    for (const result of response?.results ?? []) {
      log.append(
        `Skills (${result.source}): ${
          result.note ?? `+${result.created} new, ${result.updated} updated`
        }`,
        result.note ? "info" : "success",
      );
    }
  }, [run, token, log]);

  return {
    documents,
    analytics,
    busy,
    log,
    refresh,
    refreshAnalytics,
    uploadDocument,
    reindexDocument,
    deleteDocument,
    syncGithub,
    reindexAll,
    extractSkills,
  };
}
