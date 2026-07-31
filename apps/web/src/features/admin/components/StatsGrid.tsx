"use client";

import {
  Clock,
  Download,
  FileText,
  MessageSquare,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AnalyticsSummary } from "@/lib/api/admin";

interface StatsGridProps {
  analytics: AnalyticsSummary | null;
}

export function StatsGrid({ analytics }: StatsGridProps) {
  if (!analytics) return null;

  const stats: {
    icon: LucideIcon;
    label: string;
    value: number;
    color: string;
  }[] = [
    {
      icon: Users,
      label: "Visitors",
      value: analytics.visitors,
      color: "text-indigo-400",
    },
    {
      icon: MessageSquare,
      label: "Questions",
      value: analytics.questions,
      color: "text-cyan-400",
    },
    {
      icon: FileText,
      label: "Chats",
      value: analytics.conversations,
      color: "text-pink-400",
    },
    {
      icon: Download,
      label: "Downloads",
      value: analytics.resumeDownloads,
      color: "text-emerald-400",
    },
    {
      icon: Clock,
      label: "Avg chat",
      value: analytics.avgChatLength,
      color: "text-amber-400",
    },
  ];

  return (
    <section
      aria-label="Usage statistics"
      className="grid grid-cols-2 gap-3 sm:grid-cols-5"
    >
      {stats.map(({ icon: Icon, label, value, color }) => (
        <div
          key={label}
          className="glass-card flex flex-col justify-between rounded-xl p-3.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">{label}</span>
            <Icon size={14} className={color} aria-hidden="true" />
          </div>
          <p className="mt-2 text-xl font-bold text-white">{value}</p>
        </div>
      ))}
    </section>
  );
}
