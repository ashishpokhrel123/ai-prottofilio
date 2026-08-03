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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div className="flex items-center gap-2.5">
        <AlertTriangle size={14} className="text-status-error" aria-hidden />
        <span className="label-meta text-status-error">
          unhandled exception
        </span>
        <span className="rule flex-1" />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-medium tracking-tight text-zinc-100">
          Something went wrong
        </h1>
        <p className="text-sm leading-relaxed text-zinc-500">
          An unexpected error interrupted the page. Trying again usually fixes
          it.
        </p>
        {error.digest && (
          <p className="pt-1 font-mono text-meta text-zinc-700">
            ref {error.digest}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={reset}
        className="flex w-fit items-center gap-2 bg-signal px-4 py-2 text-sm font-medium text-panel transition-colors hover:bg-signal/90"
      >
        <RotateCcw size={14} aria-hidden="true" />
        Try again
      </button>
    </main>
  );
}
