"use client";

import { FileText, RotateCw, Trash2 } from "lucide-react";
import type { DocumentRow, DocumentStatus } from "@/lib/api/admin";
import type { BusyKey } from "../useAdminConsole";

const STATUS_STYLES: Record<DocumentStatus, string> = {
  INDEXED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  PROCESSING: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  PENDING: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  FAILED: "border-red-500/30 bg-red-500/10 text-red-300",
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
    <section className="glass-card space-y-3 rounded-2xl p-5 shadow-glass">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <FileText className="text-indigo-400" size={18} aria-hidden="true" />
          <h2 className="font-semibold text-white">
            Documents{" "}
            <span className="text-xs font-normal text-slate-500">
              ({documents.length})
            </span>
          </h2>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/10"
        >
          Refresh
        </button>
      </div>

      {documents.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">
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
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2"
              >
                {/* Synced documents have no stored file, so there is nothing
                    local to re-read — refreshing them means re-running the sync. */}
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-200">
                    {doc.title}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {doc.docType} · {doc.source}
                    {doc._count ? ` · ${doc._count.chunks} chunks` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
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
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/10 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-30"
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
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
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
