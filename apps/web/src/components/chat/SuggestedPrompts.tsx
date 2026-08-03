"use client";

import { motion } from "framer-motion";
import {
  UserRound,
  Code2,
  Cpu,
  Briefcase,
  Compass,
  Sparkles,
} from "lucide-react";
import { useChatStore } from "@/store/chat.store";

/**
 * The opening menu.
 *
 * Six cards in a 2×3 grid, each one landing on a different agent capability
 * so a first click demonstrates something distinct rather than a phrasing
 * variant of the last.
 *
 * Every card carries a category label under its question. The question is
 * what the visitor clicks; the category tells them which part of the corpus
 * the answer will come from, which is the thing a retrieval-backed portfolio
 * can promise and a static CV cannot.
 */
type Prompt = {
  /** The question shown on the card. */
  text: string;
  /** What actually gets sent — omitted when it matches the label. */
  send?: string;
  /** The corpus the answer is drawn from. */
  category: string;
  icon: typeof UserRound;
  /** Rendered, but inert: signals a capability that isn't wired up yet. */
  disabled?: boolean;
};

const PROMPTS: Prompt[] = [
  { text: "Tell me about yourself", category: "Bio", icon: UserRound },
  {
    text: "What technologies & stack do you use?",
    send: "What technologies and stack do you use?",
    category: "Skills",
    icon: Code2,
  },
  {
    text: "Show me your most interesting projects",
    category: "Projects",
    icon: Cpu,
  },
  {
    text: "Walk me through your work experience",
    category: "Experience",
    icon: Briefcase,
  },
  {
    text: "What have you been building on GitHub?",
    category: "GitHub",
    icon: Compass,
  },
  {
    text: "Paste a job description and I'll score the fit",
    category: "Coming soon",
    icon: Sparkles,
    disabled: true,
  },
];

export function SuggestedPrompts() {
  const { send, isStreaming } = useChatStore();

  return (
    <div>
      <p className="mb-3 px-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-zinc-500">
        Suggested inquiries
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROMPTS.map(({ text, send: payload, category, icon: Icon, disabled }, i) => (
          <motion.button
            key={text}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.04 * i,
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
            /* The lift is driven from Framer rather than the `.glass-card`
               CSS hover, because Framer leaves an inline `transform` on the
               element after the entrance animation and inline styles win. */
            whileHover={disabled || isStreaming ? undefined : { y: -2 }}
            whileTap={disabled || isStreaming ? undefined : { y: 0 }}
            disabled={disabled || isStreaming}
            onClick={() => void send(payload ?? text)}
            title={disabled ? "Not available yet" : text}
            className="glass-card group flex items-center gap-3.5 px-4 py-3.5 text-left disabled:cursor-not-allowed disabled:opacity-55"
          >
            {/* Icon tile — the card's single point of colour. */}
            <span
              aria-hidden
              className="glass-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]"
            >
              <Icon size={17} className="text-gemini-400" strokeWidth={1.9} />
            </span>

            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14.5px] font-semibold leading-snug tracking-[-0.01em] text-zinc-100">
                {text}
              </span>
              <span className="mt-1 text-[12px] leading-none text-zinc-400">
                {category}
              </span>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
