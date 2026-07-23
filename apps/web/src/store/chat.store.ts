import { create } from 'zustand';
import type { Citation } from '@ai-portfolio/shared';
import { streamChat, getVisitorId } from '@/lib/chat-client';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  tools?: string[];
  streaming?: boolean;
}

interface ChatState {
  messages: Message[];
  conversationId?: string;
  activeTool?: string;
  isStreaming: boolean;
  send: (text: string) => Promise<void>;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,

  reset: () => set({ messages: [], conversationId: undefined }),

  send: async (text: string) => {
    if (get().isStreaming || !text.trim()) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantId = crypto.randomUUID();
    set((s) => ({
      messages: [
        ...s.messages,
        userMsg,
        { id: assistantId, role: 'assistant', content: '', streaming: true, tools: [] },
      ],
      isStreaming: true,
    }));

    const patch = (fn: (m: Message) => Message) =>
      set((s) => ({ messages: s.messages.map((m) => (m.id === assistantId ? fn(m) : m)) }));

    try {
      for await (const chunk of streamChat({
        message: text,
        conversationId: get().conversationId,
        visitorId: getVisitorId(),
      })) {
        switch (chunk.type) {
          case 'token':
            if (chunk.conversationId) set({ conversationId: chunk.conversationId });
            if (chunk.content) patch((m) => ({ ...m, content: m.content + chunk.content }));
            break;
          case 'tool_start':
            set({ activeTool: chunk.tool });
            patch((m) => ({ ...m, tools: [...(m.tools ?? []), chunk.tool!] }));
            break;
          case 'tool_end':
            set({ activeTool: undefined });
            break;
          case 'citations':
            patch((m) => ({ ...m, citations: chunk.citations }));
            break;
          case 'done':
            patch((m) => ({ ...m, streaming: false }));
            break;
          case 'error':
            patch((m) => ({ ...m, content: m.content || chunk.content || 'Something went wrong.', streaming: false }));
            break;
        }
      }
    } catch {
      patch((m) => ({ ...m, content: m.content || 'Connection lost. Please try again.', streaming: false }));
    } finally {
      set({ isStreaming: false, activeTool: undefined });
      patch((m) => ({ ...m, streaming: false }));
    }
  },
}));
