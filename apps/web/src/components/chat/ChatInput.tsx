"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, Loader2, Mic, Square } from "lucide-react";
import { useChatStore } from "@/store/chat.store";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

/**
 * @param compact  Shrinks the field for the docked position under an active
 *                 conversation. The hero instance is deliberately oversized —
 *                 it is the page's primary call to action — but that scale
 *                 would eat the transcript once a chat is running.
 */
export function ChatInput({
  autoFocus = false,
  compact = false,
}: {
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const { send, isStreaming } = useChatStore();
  const ref = useRef<HTMLTextAreaElement>(null);
  const baseRef = useRef("");
  const submittingRef = useRef(false);

  const { supported, listening, transcript, start, stop } =
    useSpeechRecognition();

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Auto-resize textarea height
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${Math.min(ref.current.scrollHeight, 160)}px`;
    }
  }, [value]);

  // Pipe live speech into the textarea, preserving anything already typed
  useEffect(() => {
    if (listening) {
      setValue((baseRef.current ? baseRef.current + " " : "") + transcript);
    }
  }, [transcript, listening]);

  const submit = async () => {
    const text = value.trim();
    // Block empty sends, sends while the assistant is answering, and rapid
    // double-fires (e.g. Enter + click landing together).
    if (!text || isStreaming || submittingRef.current) return;
    submittingRef.current = true;
    if (listening) stop();
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
    try {
      await send(text);
    } finally {
      submittingRef.current = false;
    }
  };

  const toggleMic = () => {
    if (listening) {
      stop();
    } else {
      baseRef.current = value;
      start();
    }
  };

  const canSend = !!value.trim() && !isStreaming;

  return (
    /*
      The hero search field: one continuous pill of glass, sized so the
      controls sit inside it with real air around them rather than being
      crammed against the rim. `items-end` keeps the buttons pinned to the
      baseline as the textarea grows to its 160px cap.
    */
    <div
      className={`glass-input group relative flex items-end gap-2 p-2 sm:gap-3 sm:p-2.5 ${
        compact ? "" : "sm:p-3"
      }`}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={1}
        placeholder={
          listening ? "Listening…" : "Ask me anything, or paste a job description…"
        }
        className={`max-h-40 flex-1 resize-none bg-transparent py-2.5 pl-4 text-zinc-100 placeholder:text-zinc-400 focus:outline-none sm:pl-5 ${
          compact ? "min-h-[40px] text-body" : "min-h-[44px] text-lede"
        }`}
      />

      <div className="flex shrink-0 items-center gap-2 pr-0.5">
        {supported && (
          <button
            onClick={toggleMic}
            disabled={isStreaming}
            className={`flex shrink-0 items-center justify-center transition-colors disabled:opacity-30 ${
              compact ? "h-9 w-9" : "h-10 w-10 sm:h-12 sm:w-12"
            } ${
              listening
                ? "rounded-full bg-status-error/12 text-status-error ring-1 ring-status-error/40"
                : "glass-btn text-zinc-400 hover:text-zinc-200"
            }`}
            aria-label={listening ? "Stop recording" : "Voice input"}
            title={listening ? "Stop recording" : "Speak your question"}
          >
            {listening ? (
              <Square size={13} className="fill-current" />
            ) : (
              <Mic size={compact ? 15 : 17} />
            )}
          </button>
        )}

        <button
          onClick={() => void submit()}
          disabled={!canSend}
          className={`flex shrink-0 items-center justify-center rounded-full ${
            compact ? "h-9 w-9" : "h-10 w-10 sm:h-12 sm:w-12"
          } ${
            canSend
              ? "btn-gradient"
              : "bg-zinc-800/70 text-zinc-500 ring-1 ring-inset ring-white/40"
          }`}
          aria-label="Send message"
        >
          {isStreaming ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <ArrowUp size={compact ? 16 : 18} strokeWidth={2.5} />
          )}
        </button>
      </div>

      {listening && (
        <div className="absolute -top-6 left-1 flex items-center gap-1.5 font-mono text-meta uppercase tracking-wider text-status-error">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-status-error" />
          recording
        </div>
      )}
    </div>
  );
}
