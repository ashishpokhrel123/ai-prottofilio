"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chat.store";
import { ChatMessage } from "./ChatMessage";

export function ChatWindow() {
  const { messages, activeTool, isStreaming } = useChatStore();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTool, isStreaming]);

  return (
    /* Generous vertical rhythm. With the assistant bubble gone, whitespace is
       the only thing separating one turn from the next, so it has to be
       unambiguous — 40px reads as a break, 24px reads as a paragraph. */
    <div className="flex flex-col gap-10 py-8">
      {messages.map((m) => (
        <ChatMessage key={m.id} message={m} />
      ))}
      <div ref={endRef} className="h-2" />
    </div>
  );
}
