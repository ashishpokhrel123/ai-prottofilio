'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Github, Linkedin, FileDown, Bot, Shield, RotateCcw } from 'lucide-react';
import { useChatStore } from '@/store/chat.store';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ChatInput } from '@/components/chat/ChatInput';
import { SuggestedPrompts } from '@/components/chat/SuggestedPrompts';

export default function HomePage() {
  const { messages, reset } = useChatStore();
  const started = messages.length > 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 sm:px-6">
      {/* Header */}
      <header className="sticky top-4 z-50 my-3 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 backdrop-blur-2xl shadow-glass">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/30 bg-slate-950">
            <Bot size={18} className="text-cyan-400" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight text-white">Ashish Pokhrel</div>
            <p className="text-[11px] text-slate-500">AI Engineer</p>
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
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="GitHub"
          >
            <Github size={17} />
          </a>

          <a
            href="https://linkedin.com/in/ashishpokhrel"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="LinkedIn"
          >
            <Linkedin size={17} />
          </a>

          <a
            href="/api/v1/resume"
            className="flex items-center gap-1.5 rounded-xl bg-brand-indigo px-3.5 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
          >
            <FileDown size={14} />
            <span className="hidden sm:inline">Resume</span>
          </a>

          <a
            href="/admin"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Admin"
            title="Admin"
          >
            <Shield size={17} />
          </a>
        </nav>
      </header>

      {/* Body */}
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
            <div className="max-w-2xl space-y-4">
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
                Ask me <span className="text-gradient-brand">anything</span>.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.16 }}
                className="mx-auto max-w-md text-slate-400"
              >
                This portfolio is an AI assistant. It answers from my real projects,
                skills, and experience — with sources.
              </motion.p>
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
