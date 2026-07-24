'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, Mic, Square } from 'lucide-react';
import { useChatStore } from '@/store/chat.store';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

export function ChatInput({ autoFocus = false }: { autoFocus?: boolean }) {
  const [value, setValue] = useState('');
  const { send, isStreaming } = useChatStore();
  const ref = useRef<HTMLTextAreaElement>(null);
  const baseRef = useRef('');
  const submittingRef = useRef(false);

  const { supported, listening, transcript, start, stop } = useSpeechRecognition();

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Auto-resize textarea height
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${Math.min(ref.current.scrollHeight, 160)}px`;
    }
  }, [value]);

  // Pipe live speech into the textarea, preserving anything already typed
  useEffect(() => {
    if (listening) {
      setValue((baseRef.current ? baseRef.current + ' ' : '') + transcript);
    }
  }, [transcript, listening]);

  const submit = async () => {
    const text = value.trim();
    // Block empty sends, sends while the assistant is answering, and rapid
    // double-fires (e.g. Enter + click landing together).
    if (!text || isStreaming || submittingRef.current) return;
    submittingRef.current = true;
    if (listening) stop();
    setValue('');
    if (ref.current) ref.current.style.height = 'auto';
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
    <div className="gradient-border relative flex items-end gap-2 rounded-2xl border border-white/10 bg-slate-950/70 backdrop-blur-md p-2 shadow-glass transition-all duration-300 focus-within:border-indigo-500/40 focus-within:shadow-glow focus-within:bg-slate-950/85">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={1}
        placeholder={listening ? 'Listening…' : 'Ask me anything, or paste a job description…'}
        className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
      />

      <div className="flex items-center gap-1.5 pb-1 pr-1">
        {/* Voice input */}
        {supported && (
          <button
            onClick={toggleMic}
            disabled={isStreaming}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-200 disabled:opacity-40 ${
              listening
                ? 'border-red-500/40 bg-red-500/15 text-red-400'
                : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
            aria-label={listening ? 'Stop recording' : 'Voice input'}
            title={listening ? 'Stop recording' : 'Speak your question'}
          >
            {listening && (
              <span className="absolute inset-0 animate-ping rounded-full bg-red-500/25" />
            )}
            {listening ? <Square size={15} className="relative fill-current" /> : <Mic size={17} />}
          </button>
        )}

        {/* Gradient send button */}
        <button
          onClick={() => void submit()}
          disabled={!canSend}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
            canSend
              ? 'bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500 text-white shadow-glow hover:shadow-glow-lg hover:scale-105 active:scale-95'
              : 'bg-white/10 text-slate-500'
          }`}
          aria-label="Send message"
        >
          {isStreaming ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <ArrowUp size={18} strokeWidth={2.5} />
          )}
        </button>
      </div>

      {/* Live recording status */}
      {listening && (
        <div className="absolute -top-7 left-2 flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          Listening…
        </div>
      )}
    </div>
  );
}
