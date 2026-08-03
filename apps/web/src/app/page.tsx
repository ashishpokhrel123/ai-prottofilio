"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Github, Linkedin, Shield, RotateCcw } from "lucide-react";
import { useChatStore } from "@/store/chat.store";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ChatInput } from "@/components/chat/ChatInput";
import { SuggestedPrompts } from "@/components/chat/SuggestedPrompts";
import { ResumeButton } from "@/components/ResumeButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

function IconLink({
  href,
  label,
  children,
  external,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      aria-label={label}
      title={label}
      className="glass-btn flex h-10 w-10 items-center justify-center text-zinc-300 hover:text-zinc-100"
    >
      {children}
    </a>
  );
}

/**
 * A hero status chip. Two of them sit above the headline: what I am
 * available for, and what I do. Both are claims a visitor would otherwise
 * have to ask the assistant for, so they are stated up front for free.
 */
function HeroPill({
  children,
  live,
}: {
  children: React.ReactNode;
  live?: boolean;
}) {
  return (
    <span className="glass-pill inline-flex items-center gap-2 px-4 py-2 text-[13.5px] font-medium text-zinc-200">
      {live && (
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-emerald-500" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
      )}
      {children}
    </span>
  );
}

export default function HomePage() {
  const { messages, reset } = useChatStore();
  const started = messages.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Header ──
          A sheet of glass spanning the viewport, so the pastel canvas keeps
          showing through as content scrolls beneath it. No outer ring or cast
          shadow — a full-bleed pane has no edge for light to catch. */}
      <header className="glass-bar sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            {/* The monogram is the only opaque gradient geometry in the
                header, so the identity block reads as a mark rather than
                another glass chip. */}
            <span
              aria-hidden
              className="btn-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] font-display text-[15px] font-bold tracking-tight"
            >
              AP
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-display text-[15px] font-bold tracking-[-0.01em] text-zinc-100">
                Ashish Pokhrel
              </span>
              <span className="truncate text-[12.5px] text-zinc-500">
                Software Engineer
              </span>
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-2">
            {started && (
              <button
                onClick={reset}
                title="New session"
                aria-label="New session"
                className="glass-btn flex h-10 items-center gap-1.5 px-3.5 text-[13px] font-medium text-zinc-300 hover:text-zinc-100"
              >
                <RotateCcw size={14} />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}

            <ThemeToggle />

            <IconLink
              href="https://github.com/ashishpokhrel"
              label="GitHub"
              external
            >
              <Github size={17} />
            </IconLink>
            <IconLink
              href="https://linkedin.com/in/ashishpokhrel"
              label="LinkedIn"
              external
            >
              <Linkedin size={17} />
            </IconLink>
            <IconLink href="/admin" label="Admin">
              <Shield size={17} />
            </IconLink>

            <ResumeButton />
          </nav>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {!started ? (
          <motion.section
            key="hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-9 px-4 py-12 sm:px-6 sm:py-16"
          >
            {/*
              A quiet brand bloom behind the headline. It sits under the
              glass, which is the point — the search field and cards refract
              it, and that refraction is what makes them read as material
              rather than as translucent rectangles.
            */}
            <div
              aria-hidden
              className="bg-hero-bloom pointer-events-none absolute inset-x-0 top-[-6rem] bottom-0 -z-10"
            />

            <div>
              {/* Status chips — availability and discipline, stated before
                  the visitor has to ask for either. */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="mb-7 flex flex-wrap items-center gap-2.5"
              >
                <HeroPill live>Available for work</HeroPill>
                <HeroPill>Software Engineering</HeroPill>
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
                className="mb-1 text-[17px] text-zinc-400 sm:text-[19px]"
              >
                Hi, I&apos;m Ashish{" "}
                <span aria-hidden className="inline-block">
                  👋
                </span>
              </motion.p>

              {/* The headline breaks across two lines on purpose. "anything."
                  landing alone on the second line, in gradient, is the whole
                  proposition of the page in one word. */}
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="font-display text-[52px] font-bold leading-[0.98] tracking-[-0.035em] sm:text-[72px] lg:text-[84px]"
              >
                <span className="block text-zinc-100">Ask me</span>
                <span className="text-gradient-gemini-animated block">
                  anything.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="mt-6 max-w-2xl text-[16px] leading-[1.65] text-zinc-400 sm:text-[18px]"
              >
                Ask this AI assistant about my work. It answers directly from
                my real projects, skills and experience — complete with
                sources.
              </motion.p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-8"
            >
              <ChatInput autoFocus />
              <SuggestedPrompts />
            </motion.div>
          </motion.section>
        ) : (
          <motion.section
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 sm:px-6"
          >
            <div className="flex-1 overflow-y-auto">
              <ChatWindow />
            </div>
            {/* The docked composer floats over the transcript on the same
                glass as the header, so scrolled text refracts under it
                instead of being hidden by an opaque bar. */}
            <div className="sticky bottom-0 z-20 pb-5 pt-3">
              <ChatInput compact />
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
