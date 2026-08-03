"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { motion } from "framer-motion";
import { CARD_TOOLS } from "@ai-portfolio/shared";
import type { Message } from "@/store/chat.store";
import { useChatStore } from "@/store/chat.store";
import { TypingIndicator } from "./TypingIndicator";
import { ProjectCards } from "./ProjectCards";
import { SkillGrid } from "./SkillGrid";
import { PipelineTrace } from "./PipelineTrace";
import { CODE_THEME } from "./code-theme";

/**
 * Reveals `target` smoothly, character-by-character.
 *
 * Providers stream in uneven bursts; this decouples display speed from network
 * chunk size by catching up to the latest content a little each frame. When
 * streaming ends it snaps to the full text so nothing is ever truncated.
 */
function useSmoothText(target: string, streaming: boolean): string {
  const [shown, setShown] = useState(streaming ? "" : target);
  const targetRef = useRef(target);
  const idxRef = useRef(shown.length);
  targetRef.current = target;

  useEffect(() => {
    if (!streaming) {
      idxRef.current = targetRef.current.length;
      setShown(targetRef.current);
      return;
    }
    let raf = 0;
    const loop = () => {
      const t = targetRef.current;
      if (idxRef.current < t.length) {
        const remaining = t.length - idxRef.current;
        idxRef.current += Math.max(2, Math.ceil(remaining / 12));
        setShown(t.slice(0, idxRef.current));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [streaming]);

  return streaming ? shown : target;
}

/**
 * The visitor's turn.
 *
 * The only container in the conversation. Inverting the usual arrangement —
 * question boxed, answer on the page — makes the answer the primary content
 * rather than one half of a symmetric back-and-forth, and it is what lets the
 * assistant's prose be set at real reading size.
 */
function UserTurn({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex justify-end"
    >
      <div className="max-w-[85%] rounded-[18px] border border-gemini-500/25 bg-gradient-to-b from-panel-raised to-panel-sunken px-4 py-3 shadow-sm sm:max-w-[75%]">
        <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-zinc-200">
          {content}
        </p>
      </div>
    </motion.div>
  );
}

/**
 * Dispatches on role.
 *
 * A separate component rather than a branch inside one, because the assistant
 * turn calls `useSmoothText` and the user turn does not — returning early past
 * a hook is a rules-of-hooks violation that only misfires once a conversation
 * has mixed roles in it, which is to say always.
 */
export function ChatMessage({ message }: { message: Message }) {
  return message.role === "user" ? (
    <UserTurn content={message.content} />
  ) : (
    <AssistantTurn message={message} />
  );
}

function AssistantTurn({ message }: { message: Message }) {
  const activeTool = useChatStore((s) => s.activeTool);
  const isThinking = message.streaming && !message.content;
  const smoothContent = useSmoothText(message.content, !!message.streaming);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="group"
    >
      {/*
        No attribution rule in the normal case.

        It read "assistant" above every answer, next to a dot, above a
        hairline — three elements restating what the layout already says: the
        question is boxed and right-aligned, the answer is plain text on the
        page. Turn-taking was never ambiguous. Only the failure state earns a
        marker, because that one is not visible from the layout.
      */}
      {message.failed && (
        <div className="mb-2.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 bg-status-error" />
          <span className="label-meta text-status-error">failed</span>
        </div>
      )}

      <div className="prose-answer">
        {isThinking ? (
          <TypingIndicator tool={activeTool} />
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || "");
                if (inline || !match) {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }
                return (
                  <div className="my-4 overflow-hidden rounded-xl border border-panel-line">
                    <div className="flex items-center justify-between border-b border-panel-line bg-panel-raised px-3 py-1.5">
                      <span className="label-meta">{match[1]}</span>
                    </div>
                    <SyntaxHighlighter
                      style={CODE_THEME}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{
                        margin: 0,
                        padding: "1rem",
                        background: "var(--panel-sunken)",
                        fontSize: "12.5px",
                      }}
                      {...props}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  </div>
                );
              },
            }}
          >
            {smoothContent}
          </ReactMarkdown>
        )}

        {message.streaming && message.content && (
          <span className="ml-0.5 inline-block h-[15px] w-[7px] animate-caret bg-signal align-text-bottom" />
        )}
      </div>

      {/* Structured tool results */}
      {message.cards?.map((card) =>
        card.tool === CARD_TOOLS.PROJECT_SEARCH ? (
          <ProjectCards key={card.tool} projects={card.projects} />
        ) : (
          <SkillGrid key={card.tool} skills={card.skills} />
        ),
      )}

      {/* ── Provenance ──
          Each row carried an index, a title, the source system and a
          similarity bar. Three of those four were metadata about retrieval,
          not about the source — and a reader checking where an answer came
          from wants the document name. The score stays, as a title attribute,
          for anyone who goes looking. */}
      {message.citations && message.citations.length > 0 && (
        <ol className="mt-4 space-y-0.5">
          {message.citations.map((c) => (
            <li
              key={c.chunkId}
              className="flex items-baseline gap-2 text-[13px]"
              title={`${c.source.replace(/_/g, " ").toLowerCase()} · similarity ${c.score.toFixed(3)}`}
            >
              <span className="shrink-0 font-mono text-meta text-zinc-700">
                {c.index}
              </span>
              <span className="min-w-0 truncate text-zinc-500">{c.title}</span>
            </li>
          ))}
        </ol>
      )}

      {message.trace && (
        <PipelineTrace stages={message.trace} streaming={message.streaming} />
      )}
    </motion.div>
  );
}
