"use client";

import { useEffect, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { apiUrl } from "@/lib/api/config";

const FILENAME = "Ashish-Pokhrel-Resume.pdf";
const ERROR_VISIBLE_MS = 4000;

/**
 * Downloads the résumé from the API.
 *
 * Two things a plain `<a href="/api/v1/resume">` got wrong:
 *
 * 1. It assumed the API is same-origin. The documented deployment puts the
 *    frontend on Vercel and the API elsewhere, where that path 404s on the
 *    static host — so the button silently broke in production only.
 * 2. When no PDF has been uploaded, the API answers with a JSON error. A
 *    navigation renders that raw in a blank tab. Fetching instead keeps the
 *    failure inside the page, where it can be explained.
 */
export function ResumeButton() {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string>();

  // Clears the error automatically; a permanently red button reads as broken
  // rather than as "that didn't work, try again".
  useEffect(() => {
    if (state !== "error") return;
    const timer = setTimeout(() => setState("idle"), ERROR_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function download() {
    if (state === "loading") return;
    setState("loading");

    try {
      const response = await fetch(apiUrl("/resume"));

      if (!response.ok) {
        setMessage(
          response.status === 404
            ? "No resume uploaded yet — ask the assistant instead."
            : "Resume download failed. Please try again.",
        );
        setState("error");
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = FILENAME;
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setState("idle");
    } catch {
      setMessage("Couldn't reach the server. Please try again.");
      setState("error");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void download()}
        disabled={state === "loading"}
        aria-label="Download resume"
        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-medium text-white transition ${
          state === "error"
            ? "bg-gradient-to-r from-rose-500 to-red-500"
            : "bg-gradient-to-r from-indigo-500 to-violet-500 hover:shadow-glow hover:brightness-110"
        } disabled:opacity-70`}
      >
        {state === "loading" ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <FileDown size={14} />
        )}
        <span className="hidden sm:inline">Resume</span>
      </button>

      {state === "error" && message && (
        <p
          role="status"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-rose-500/30 bg-slate-950/95 px-3 py-2 text-[11px] leading-snug text-rose-200 shadow-lg backdrop-blur"
        >
          {message}
        </p>
      )}
    </div>
  );
}
