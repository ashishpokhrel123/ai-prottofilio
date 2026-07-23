'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion } from 'framer-motion';
import { Bot, User, Wrench, Bookmark, CheckCircle2, Loader2 } from 'lucide-react';
import type { Message } from '@/store/chat.store';
import { useChatStore } from '@/store/chat.store';
import { TypingIndicator } from './TypingIndicator';

function toolLabel(tool?: string) {
  if (!tool) return 'Thinking';
  return `Using ${tool.replace(/_/g, ' ')}`;
}

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const activeTool = useChatStore((s) => s.activeTool);
  const isThinking = !isUser && message.streaming && !message.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`flex gap-3 sm:gap-4 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          isUser
            ? 'bg-brand-indigo text-white'
            : `border border-indigo-500/30 bg-slate-900 text-cyan-400 ${
                message.streaming ? 'shadow-glow animate-pulse-glow' : ''
              }`
        }`}
      >
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>

      {/* Bubble */}
      <div
        className={`relative max-w-[85%] rounded-2xl p-4 sm:max-w-[80%] ${
          isUser
            ? 'bg-brand-indigo text-white'
            : 'border border-white/[0.08] bg-slate-900/70 backdrop-blur-xl'
        }`}
      >
        {/* Animated top accent line while streaming */}
        {message.streaming && !isUser && (
          <span
            className="absolute inset-x-4 top-0 h-px animate-border-flow rounded-full"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(6,182,212,0.8), rgba(99,102,241,0.8), transparent)',
              backgroundSize: '200% 100%',
            }}
          />
        )}

        {/* Tool trace */}
        {message.tools && message.tools.length > 0 && !isUser && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-white/10 pb-2.5">
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <Wrench size={11} className="text-cyan-400" /> Tools
            </span>
            {message.tools.map((t, i) => {
              const isRunning = message.streaming && activeTool === t;
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium transition-colors ${
                    isRunning
                      ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                      : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300'
                  }`}
                >
                  {isRunning ? (
                    <Loader2 size={10} className="animate-spin text-cyan-300" />
                  ) : (
                    <CheckCircle2 size={10} className="text-cyan-400" />
                  )}
                  {t.replace(/_/g, ' ')}
                </span>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="prose-chat">
          {isThinking ? (
            <TypingIndicator label={toolLabel(activeTool)} />
          ) : (
            <span className={message.streaming ? 'animate-stream-in' : undefined}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <div className="my-3 overflow-hidden rounded-xl border border-white/10">
                        <div className="flex items-center justify-between border-b border-white/10 bg-slate-950 px-3 py-1.5 font-mono text-[11px] text-slate-400">
                          <span>{match[1]}</span>
                        </div>
                        <SyntaxHighlighter
                          style={vscDarkPlus}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{ margin: 0, padding: '1rem', background: '#080911' }}
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      </div>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </span>
          )}

          {/* Smooth streaming caret */}
          {message.streaming && message.content && (
            <span className="ml-0.5 inline-block h-4 w-[3px] origin-bottom animate-caret rounded-full bg-cyan-400 align-middle" />
          )}
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <Bookmark size={12} className="text-indigo-400" /> Sources
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {message.citations.map((c) => (
                <div
                  key={c.chunkId}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-2.5 py-1.5 text-xs transition hover:border-indigo-500/30 hover:bg-white/10"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-500/20 font-mono text-[10px] font-bold text-indigo-300">
                      {c.index}
                    </span>
                    <span className="truncate font-medium text-slate-200">{c.title}</span>
                  </div>
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-400">
                    {c.source}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
