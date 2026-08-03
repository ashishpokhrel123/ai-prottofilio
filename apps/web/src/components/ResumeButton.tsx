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
        className={`flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold tracking-[-0.01em] transition-colors disabled:opacity-60 ${
          state === "error"
            ? "bg-status-error/12 text-status-error ring-1 ring-inset ring-status-error/40"
            : "btn-gradient"
        }`}
      >
        {state === "loading" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <FileDown size={15} />
        )}
        <span className="hidden sm:inline">Resume</span>
      </button>

      {state === "error" && message && (
        <p
          role="status"
          className="glass-card absolute right-0 top-full z-50 mt-2 w-60 px-3.5 py-2.5 text-[12px] leading-snug text-status-error"
        >
          {message}
        </p>
      )}
    </div>
  );
}
