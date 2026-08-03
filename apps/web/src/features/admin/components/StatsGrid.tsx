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
      color: "text-signal",
    },
    {
      icon: MessageSquare,
      label: "Questions",
      value: analytics.questions,
      color: "text-signal",
    },
    {
      icon: FileText,
      label: "Chats",
      value: analytics.conversations,
      color: "text-signal",
    },
    {
      icon: Download,
      label: "Downloads",
      value: analytics.resumeDownloads,
      color: "text-signal",
    },
    {
      icon: Clock,
      label: "Avg chat",
      value: analytics.avgChatLength,
      color: "text-status-warn",
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
          className="panel flex flex-col justify-between p-3.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">{label}</span>
            <Icon size={14} className={color} aria-hidden="true" />
          </div>
          <p className="mt-2 text-xl font-bold text-zinc-100">{value}</p>
        </div>
      ))}
    </section>
  );
}
