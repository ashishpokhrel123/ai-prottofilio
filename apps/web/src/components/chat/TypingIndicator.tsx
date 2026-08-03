"use client";

import { AnimatePresence, motion } from "framer-motion";

/**
 * The pre-first-token state.
 *
 * Replaces three bouncing gradient dots with the name of the tool that is
 * actually running. The dots said "something is happening"; this says what —
 * and it costs nothing extra, because the executor was already emitting
 * `tool_start` and the store was already tracking it.
 */
export function TypingIndicator({ tool }: { tool?: string }) {
  const label = tool ? tool.replace(/_/g, " ") : "reasoning";

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      {/* Indeterminate progress on a 1px rule. A spinner claims a duration it
          cannot know; a scan line just says "running". */}
      <span className="scan relative block h-px w-16 bg-panel-line" />

      <AnimatePresence mode="wait">
        <motion.span
          key={label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="font-mono text-micro text-zinc-400"
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
