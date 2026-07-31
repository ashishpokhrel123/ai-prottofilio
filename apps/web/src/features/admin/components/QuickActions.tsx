"use client";

import { Github, RefreshCw, Wand2, type LucideIcon } from "lucide-react";
import type { BusyKey } from "../useAdminConsole";

type Accent = "cyan" | "violet" | "indigo";

const ACCENT_STYLES: Record<Accent, { border: string; icon: string }> = {
  cyan: {
    border: "hover:border-cyan-500/40 hover:bg-cyan-500/10",
    icon: "bg-cyan-500/20 text-cyan-400",
  },
  violet: {
    border: "hover:border-violet-500/40 hover:bg-violet-500/10",
    icon: "bg-violet-500/20 text-violet-400",
  },
  indigo: {
    border: "hover:border-indigo-500/40 hover:bg-indigo-500/10",
    icon: "bg-indigo-500/20 text-indigo-400",
  },
};

interface QuickActionsProps {
  busy: BusyKey;
  onSyncGithub: () => void;
  onExtractSkills: () => void;
  onReindexAll: () => void;
}

export function QuickActions({
  busy,
  onSyncGithub,
  onExtractSkills,
  onReindexAll,
}: QuickActionsProps) {
  const actions: {
    key: BusyKey;
    icon: LucideIcon;
    title: string;
    subtitle: string;
    accent: Accent;
    onClick: () => void;
  }[] = [
    {
      key: "github",
      icon: Github,
      title: "Sync GitHub",
      subtitle: "Fetch and embed repositories",
      accent: "cyan",
      onClick: onSyncGithub,
    },
    {
      key: "skills",
      icon: Wand2,
      title: "Extract skills",
      subtitle: "From GitHub and the resume",
      accent: "violet",
      onClick: onExtractSkills,
    },
    {
      key: "reindex",
      icon: RefreshCw,
      title: "Re-index",
      subtitle: "Rebuild pending embeddings",
      accent: "indigo",
      onClick: onReindexAll,
    },
  ];

  return (
    <section
      aria-label="Quick actions"
      className="glass-card grid grid-cols-1 gap-3 rounded-2xl p-5 sm:grid-cols-3"
    >
      {actions.map(({ key, icon: Icon, title, subtitle, accent, onClick }) => {
        const isBusy = busy === key;
        const styles = ACCENT_STYLES[accent];

        return (
          <button
            key={title}
            type="button"
            onClick={onClick}
            // Disabled while *any* action runs: these all mutate the same
            // knowledge base, and overlapping runs produce confusing results.
            disabled={busy !== null}
            aria-busy={isBusy}
            className={`flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition disabled:opacity-60 ${styles.border}`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}
            >
              {isBusy ? (
                <RefreshCw
                  size={18}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Icon size={20} aria-hidden="true" />
              )}
            </span>
            <span>
              <span className="block text-xs font-semibold text-white">
                {title}
              </span>
              <span className="block text-[11px] text-slate-400">
                {subtitle}
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
