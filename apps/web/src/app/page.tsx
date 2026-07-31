"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Github,
  Linkedin,
  Bot,
  Shield,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useChatStore } from "@/store/chat.store";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ChatInput } from "@/components/chat/ChatInput";
import { SuggestedPrompts } from "@/components/chat/SuggestedPrompts";
import { ResumeButton } from "@/components/ResumeButton";

export default function HomePage() {
  const { messages, reset } = useChatStore();
  const started = messages.length > 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 sm:px-6">
      {/* ── Header ── */}
      <header className="sticky top-4 z-50 my-3 flex items-center justify-between rounded-2xl border border-white/[0.08] bg-slate-950/70 px-4 py-3 backdrop-blur-2xl shadow-glass">
        {/* Animated gradient bottom line */}
        <span
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px animate-border-flow rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(99,102,241,0.6), rgba(6,182,212,0.5), rgba(236,72,153,0.3), transparent)",
            backgroundSize: "200% 100%",
          }}
        />

        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/30 bg-slate-950">
            <Bot size={18} className="text-cyan-400" />
            {/* Online pulse dot */}
            <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight text-white">
              Ashish Pokhrel
            </div>
            <p className="text-[11px] text-slate-500">Software Engineer</p>
          </div>
        </div>

        <nav className="flex items-center gap-2">
          {started && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
              title="New chat"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">New chat</span>
            </button>
          )}

          <a
            href="https://github.com/ashishpokhrel"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white hover:border-white/20"
            aria-label="GitHub"
          >
            <Github size={17} />
          </a>

          <a
            href="https://linkedin.com/in/ashishpokhrel"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white hover:border-white/20"
            aria-label="LinkedIn"
          >
            <Linkedin size={17} />
          </a>

          <ResumeButton />

          <a
            href="/admin"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white hover:border-white/20"
            aria-label="Admin"
            title="Admin"
          >
            <Shield size={17} />
          </a>
        </nav>
      </header>

      {/* ── Body ── */}
      <AnimatePresence mode="wait">
        {!started ? (
          <motion.section
            key="hero"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="flex flex-1 flex-col items-center justify-center gap-10 py-12 text-center"
          >
            {/* ── Orbital decoration ── */}
            <div className="relative">
              {/* Outer ring */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[320px] w-[320px] sm:h-[420px] sm:w-[420px] rounded-full border border-dashed border-indigo-500/[0.12] animate-orbit-spin pointer-events-none">
                <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-indigo-400/60 shadow-glow" />
              </div>
              {/* Inner ring */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[220px] w-[220px] sm:h-[300px] sm:w-[300px] rounded-full border border-dashed border-cyan-500/[0.10] animate-orbit-spin-reverse pointer-events-none">
                <span className="absolute -bottom-1 right-0 h-2 w-2 rounded-full bg-cyan-400/60 shadow-glow-cyan" />
              </div>

              {/* Content */}
              <div className="relative z-10 max-w-2xl space-y-4">
                {/* Status badge */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mx-auto flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  <span className="text-[11px] font-medium text-emerald-300">
                    Available for work
                  </span>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-slate-500"
                >
                  Hi, I&apos;m Ashish 👋
                </motion.p>

                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 }}
                  className="text-4xl font-bold tracking-tight text-white sm:text-6xl"
                >
                  Ask me{" "}
                  <span className="text-gradient-brand inline-block">
                    anything
                    <Sparkles className="ml-1 inline-block h-5 w-5 sm:h-7 sm:w-7 animate-sparkle text-cyan-400" />
                  </span>
                  .
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.16 }}
                  className="mx-auto max-w-md text-slate-400"
                >
                  This portfolio is an AI assistant. It answers from my real
                  projects, skills, and experience — with sources.
                </motion.p>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24 }}
              className="w-full max-w-2xl space-y-6"
            >
              <ChatInput autoFocus />
              <SuggestedPrompts />
            </motion.div>
          </motion.section>
        ) : (
          <motion.section
            key="chat"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 overflow-y-auto pr-1">
              <ChatWindow />
            </div>
            <div className="sticky bottom-0 z-20 bg-gradient-to-t from-ink via-ink/95 to-transparent pb-6 pt-4 backdrop-blur-sm">
              <ChatInput />
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
