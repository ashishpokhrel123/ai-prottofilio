"use client";

import { FileText, RotateCw, Trash2 } from "lucide-react";
import type { DocumentRow, DocumentStatus } from "@/lib/api/admin";
import type { BusyKey } from "../useAdminConsole";

const STATUS_STYLES: Record<DocumentStatus, string> = {
  INDEXED: "border-signal/30 bg-signal/10 text-signal",
  PROCESSING: "border-status-warn/30 bg-status-warn/10 text-status-warn",
  PENDING: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  FAILED: "border-status-error/30 bg-status-error/10 text-status-error",
};

interface DocumentListProps {
  documents: DocumentRow[];
  busy: BusyKey;
  onRefresh: () => void;
  onReindex: (id: string) => void;
  onDelete: (id: string, title: string) => void;
}

export function DocumentList({
  documents,
  busy,
  onRefresh,
  onReindex,
  onDelete,
}: DocumentListProps) {
  return (
    <section className="panel space-y-3 p-5 shadow-raised">
      <div className="flex items-center justify-between border-b border-panel-line pb-3">
        <div className="flex items-center gap-2">
          <FileText className="text-signal" size={18} aria-hidden="true" />
          <h2 className="font-semibold text-zinc-100">
            Documents{" "}
            <span className="text-xs font-normal text-zinc-500">
              ({documents.length})
            </span>
          </h2>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="border border-panel-line px-2.5 py-1 text-[11px] text-zinc-300 transition hover:bg-panel-hover"
        >
          Refresh
        </button>
      </div>

      {documents.length === 0 ? (
        <p className="py-4 text-center text-xs text-zinc-500">
          No documents yet. Upload one or sync GitHub.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {documents.map((doc) => {
            const isBusy = busy === `doc-${doc.id}`;
            // Only uploaded documents keep a stored file to re-read.
            const canReindex = doc.source !== "GITHUB";

            return (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 border border-panel-line bg-panel-raised px-3 py-2"
              >
                {/* Synced documents have no stored file, so there is nothing
                    local to re-read — refreshing them means re-running the sync. */}
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-200">
                    {doc.title}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {doc.docType} · {doc.source}
                    {doc._count ? ` · ${doc._count.chunks} chunks` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={` border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
 STATUS_STYLES[doc.status] ?? STATUS_STYLES.PENDING
 }`}
                  >
                    {doc.status}
                  </span>

                  <button
                    type="button"
                    onClick={() => onReindex(doc.id)}
                    disabled={isBusy || !canReindex}
                    aria-label={`Re-index ${doc.title}`}
                    title={
                      canReindex
                        ? "Re-index"
                        : "Synced from GitHub — use Sync GitHub to refresh"
                    }
                    className="flex h-7 w-7 items-center justify-center border border-panel-line text-zinc-400 transition hover:bg-panel-hover hover:text-signal disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <RotateCw
                      size={13}
                      className={isBusy ? "animate-spin" : undefined}
                      aria-hidden="true"
                    />
                  </button>

                  <button
                    type="button"
                    // Deletion cascades to every chunk and cannot be undone.
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete "${doc.title}" and all of its embeddings? This cannot be undone.`,
                        )
                      ) {
                        onDelete(doc.id, doc.title);
                      }
                    }}
                    disabled={isBusy}
                    aria-label={`Delete ${doc.title}`}
                    title="Delete"
                    className="flex h-7 w-7 items-center justify-center border border-panel-line text-zinc-400 transition hover:bg-status-error/10 hover:text-status-error disabled:opacity-40"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
