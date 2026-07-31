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
    <div className="flex flex-col gap-6 py-6">
      {messages.map((m) => (
        <ChatMessage key={m.id} message={m} />
      ))}
      <div ref={endRef} className="h-2" />
    </div>
  );
}
