"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Route-level error boundary.
 *
 * Next.js renders this instead of a blank screen when a client component
 * throws during render. Without it, an unexpected error in the chat tree takes
 * the whole page down with no way back.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with a real error reporter (Sentry et al.) when one is wired up.
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
        <AlertTriangle size={26} aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-white">
          Something went wrong
        </h1>
        <p className="text-sm text-slate-400">
          An unexpected error interrupted the page. Trying again usually fixes
          it.
        </p>
        {error.digest && (
          <p className="font-mono text-[11px] text-slate-600">
            Reference: {error.digest}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2.5 text-sm font-medium text-white shadow-glow transition hover:opacity-95"
      >
        <RotateCcw size={15} aria-hidden="true" />
        Try again
      </button>
    </main>
  );
}
