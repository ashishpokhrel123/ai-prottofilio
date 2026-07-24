'use client';

import { motion, AnimatePresence } from 'framer-motion';

/**
 * The "assistant is answering" state. Shown inside the assistant bubble while
 * the agent is reasoning / retrieving, before the first token streams in.
 * Three staggered bouncing dots with gradient colors + a live status label
 * that swaps as the agent moves between tools, plus a subtle shimmer bar.
 */

const DOT_COLORS = ['#818cf8', '#22d3ee', '#f472b6']; // indigo, cyan, pink

export function TypingIndicator({ label = 'Thinking' }: { label?: string }) {
  return (
    <div className="space-y-2 py-0.5">
      <div className="flex items-center gap-3">
        <div className="flex items-end gap-1">
          {DOT_COLORS.map((color, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full animate-bounce-dot"
              style={{
                backgroundColor: color,
                animationDelay: `${i * 0.16}s`,
                boxShadow: `0 0 8px ${color}60`,
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-xs font-medium text-slate-400"
          >
            {label}
            <span className="ml-0.5 inline-flex">
              <span className="animate-bounce-dot" style={{ animationDelay: '0s' }}>.</span>
              <span className="animate-bounce-dot" style={{ animationDelay: '0.2s' }}>.</span>
              <span className="animate-bounce-dot" style={{ animationDelay: '0.4s' }}>.</span>
            </span>
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Shimmer bar */}
      <div className="h-px w-24 overflow-hidden rounded-full">
        <div
          className="h-full w-full animate-shimmer rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(129,140,248,0.5), rgba(34,211,238,0.4), transparent)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
    </div>
  );
}
