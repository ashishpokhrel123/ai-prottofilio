"use client";

import Link from "next/link";
import { ArrowLeft, BarChart3, LogOut, ShieldAlert } from "lucide-react";
import { AUTH_DEV_BYPASS } from "@/lib/api/config";
import { useAdminConsole } from "../useAdminConsole";
import { ActivityLog } from "./ActivityLog";
import { DocumentList } from "./DocumentList";
import { QuickActions } from "./QuickActions";
import { StatsGrid } from "./StatsGrid";
import { UploadPanel } from "./UploadPanel";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface AdminDashboardProps {
  token: string;
  onLogout: () => void;
}

/**
 * Composes the console from focused components. This file holds layout only —
 * all behaviour lives in `useAdminConsole`.
 */
export function AdminDashboard({ token, onLogout }: AdminDashboardProps) {
  const console = useAdminConsole(token, onLogout);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* An unguarded console must never look like a normal one — the whole
          risk of a dev bypass is forgetting it is on. */}
      {AUTH_DEV_BYPASS && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border border-status-warn/30 bg-status-warn/10 px-3.5 py-3 text-xs text-status-warn"
        >
          <ShieldAlert
            size={15}
            className="mt-px shrink-0"
            aria-hidden="true"
          />
          <span>
            <strong className="font-semibold">Authentication bypassed.</strong>{" "}
            Every admin endpoint is open to anyone who can reach this API. Set{" "}
            <code className="font-mono">AUTH_DEV_BYPASS=false</code> and{" "}
            <code className="font-mono">NEXT_PUBLIC_AUTH_DEV_BYPASS=false</code>{" "}
            to restore the login. Production builds ignore both.
          </span>
        </div>
      )}

      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to portfolio"
            className="flex h-9 w-9 items-center justify-center border border-panel-line bg-panel-raised text-zinc-300 transition hover:bg-panel-hover hover:text-zinc-100"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Admin Console
            </h1>
            <p className="text-xs text-zinc-400">
              Knowledge base ingestion and retrieval operations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void console.refreshAnalytics()}
            className="flex items-center gap-2 border border-signal/30 bg-signal/10 px-3.5 py-2 text-xs font-medium text-signal transition hover:bg-signal/20"
          >
            <BarChart3 size={15} aria-hidden="true" /> Refresh stats
          </button>
          {/* Hidden rather than disabled under the bypass: there is no session
              to end, so the button would be a control that does nothing. */}
          {!AUTH_DEV_BYPASS && (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out"
              title="Sign out"
              className="flex items-center gap-2 border border-panel-line bg-panel-raised px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-panel-hover hover:text-zinc-100"
            >
              <LogOut size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <StatsGrid analytics={console.analytics} />

      <UploadPanel
        onUpload={console.uploadDocument}
        isUploading={console.busy === "upload"}
      />

      <QuickActions
        busy={console.busy}
        onSyncGithub={() => void console.syncGithub()}
        onExtractSkills={() => void console.extractSkills()}
        onReindexAll={() => void console.reindexAll()}
      />

      <DocumentList
        documents={console.documents}
        busy={console.busy}
        onRefresh={() => void console.refresh()}
        onReindex={(id) => void console.reindexDocument(id)}
        onDelete={(id, title) => void console.deleteDocument(id, title)}
      />

      <ActivityLog entries={console.log.entries} />
    </main>
  );
}
