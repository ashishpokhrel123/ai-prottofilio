'use client';

import { motion, AnimatePresence } from 'framer-motion';

/**
 * The "assistant is answering" state. Shown inside the assistant bubble while
 * the agent is reasoning / retrieving, before the first token streams in.
 * Three staggered bouncing dots + a live status label that swaps as the agent
 * moves between tools.
 */
export function TypingIndicator({ label = 'Thinking' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="flex items-end gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce-dot shadow-glow-cyan"
            style={{ animationDelay: `${i * 0.16}s` }}
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
  );
}
