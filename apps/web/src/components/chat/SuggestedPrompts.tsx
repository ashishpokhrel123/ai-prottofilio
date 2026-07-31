"use client";

import { motion } from "framer-motion";
import { User, Sparkles, Cpu, Code2, Briefcase, Compass } from "lucide-react";
import { useChatStore } from "@/store/chat.store";

/**
 * The opening menu.
 *
 * Each prompt is chosen to land on a different agent tool — bio, skills,
 * projects, experience, GitHub, job-fit — so a visitor's first click
 * demonstrates a distinct capability rather than six phrasings of one.
 */
const PROMPTS = [
  {
    text: "Tell me about yourself",
    icon: User,
    category: "Bio",
    color: "#a78bfa",
    hoverBg: "hover:border-violet-400/40 hover:bg-violet-500/[0.08]",
  },
  {
    text: "What technologies & stack do you use?",
    icon: Code2,
    category: "Skills",
    color: "#34d399",
    hoverBg: "hover:border-emerald-400/40 hover:bg-emerald-500/[0.08]",
  },
  {
    text: "Show me your most interesting projects",
    icon: Cpu,
    category: "Projects",
    color: "#22d3ee",
    hoverBg: "hover:border-cyan-400/40 hover:bg-cyan-500/[0.08]",
  },
  {
    text: "Walk me through your work experience",
    icon: Briefcase,
    category: "Experience",
    color: "#fbbf24",
    hoverBg: "hover:border-amber-400/40 hover:bg-amber-500/[0.08]",
  },
  {
    text: "What have you been building on GitHub?",
    icon: Compass,
    category: "GitHub",
    color: "#f472b6",
    hoverBg: "hover:border-pink-400/40 hover:bg-pink-500/[0.08]",
  },
  {
    // Triggers the job-description analyzer, the one tool a visitor is
    // unlikely to guess exists.
    text: "Paste a job description and I'll score the fit",
    icon: Sparkles,
    category: "Job fit",
    color: "#818cf8",
    hoverBg: "hover:border-indigo-400/40 hover:bg-indigo-500/[0.08]",
  },
];

export function SuggestedPrompts() {
  const { send, isStreaming } = useChatStore();

  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-medium uppercase tracking-wider text-slate-400">
        Suggested Inquiries
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {PROMPTS.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.button
              key={p.text}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              disabled={isStreaming}
              onClick={() => void send(p.text)}
              className={`accent-bar-left group flex items-start gap-3 rounded-xl border border-white/[0.08] bg-slate-900/60 backdrop-blur-xl p-3.5 pl-5 text-left shadow-glass transition-all duration-300 disabled:opacity-40 hover:-translate-y-1 hover:shadow-glow-lg ${p.hoverBg}`}
              style={{ "--accent-color": p.color } as React.CSSProperties}
            >
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg"
                style={{
                  borderColor: `${p.color}33`,
                  backgroundColor: `${p.color}15`,
                  color: p.color,
                }}
              >
                <Icon size={15} />
              </div>
              <div className="space-y-0.5">
                <span className="block text-xs font-semibold text-slate-200 group-hover:text-white transition-colors">
                  {p.text}
                </span>
                <span
                  className="block text-[10px] font-mono transition-colors"
                  style={{ color: `${p.color}99` }}
                >
                  {p.category}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
