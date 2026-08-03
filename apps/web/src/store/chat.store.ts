import { create } from "zustand";
import {
  CARD_TOOLS,
  projectCardsSchema,
  skillGroupsSchema,
  traceStageSchema,
  type Citation,
  type ProjectCard,
  type SkillGroups,
  type TraceStage,
} from "@ai-portfolio/shared";
import { getVisitorId, streamChat } from "@/lib/chat-client";

/**
 * A renderable result attached to an assistant turn.
 *
 * Discriminated on `tool` so `ChatMessage` picks a component with the compiler
 * checking the payload type, rather than casting an `unknown` blob.
 */
export type MessageCard =
  | { tool: typeof CARD_TOOLS.PROJECT_SEARCH; projects: ProjectCard[] }
  | { tool: typeof CARD_TOOLS.SKILLS; skills: SkillGroups };

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  tools?: string[];
  cards?: MessageCard[];
  /**
   * Measured pipeline stages, in the order the API reported them.
   *
   * Only ever appended from `trace` events — nothing in the UI synthesises a
   * stage. An answer that ran no retrieval simply has fewer rows, which is the
   * honest rendering of what happened.
   */
  trace?: TraceStage[];
  streaming?: boolean;
  failed?: boolean;
}

/**
 * Validates a `tool_end` payload at the trust boundary.
 *
 * The API promises a shape; the browser verifies it. A payload that fails
 * validation is dropped silently — losing a card is a far better outcome than
 * a render crash that takes the whole answer down with it.
 */
function toCard(tool: string | undefined, data: unknown): MessageCard | null {
  if (!tool || data === undefined || data === null) return null;

  if (tool === CARD_TOOLS.PROJECT_SEARCH) {
    const parsed = projectCardsSchema.safeParse(data);
    return parsed.success && parsed.data.length > 0
      ? { tool: CARD_TOOLS.PROJECT_SEARCH, projects: parsed.data }
      : null;
  }

  if (tool === CARD_TOOLS.SKILLS) {
    const parsed = skillGroupsSchema.safeParse(data);
    return parsed.success && Object.keys(parsed.data).length > 0
      ? { tool: CARD_TOOLS.SKILLS, skills: parsed.data }
      : null;
  }

  return null;
}

interface ChatState {
  messages: Message[];
  conversationId?: string;
  activeTool?: string;
  isStreaming: boolean;
  send: (text: string) => Promise<void>;
  /** Cancels the in-flight answer, keeping whatever has streamed so far. */
  stop: () => void;
  reset: () => void;
}

/**
 * Chat state.
 *
 * Zustand rather than React Query: this is a streaming, append-only
 * conversation, not a cacheable request/response resource.
 */
export const useChatStore = create<ChatState>((set, get) => {
  // Kept outside the store so aborting never triggers a re-render.
  let controller: AbortController | null = null;

  const patchMessage = (id: string, update: (m: Message) => Message) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? update(m) : m)),
    }));

  return {
    messages: [],
    isStreaming: false,

    reset: () => {
      controller?.abort();
      controller = null;
      set({
        messages: [],
        conversationId: undefined,
        activeTool: undefined,
        isStreaming: false,
      });
    },

    stop: () => {
      controller?.abort();
      controller = null;
      set({ isStreaming: false, activeTool: undefined });
    },

    send: async (text: string) => {
      const trimmed = text.trim();
      // Guarding here as well as in the input keeps the store correct
      // regardless of which UI calls it.
      if (!trimmed || get().isStreaming) return;

      const assistantId = crypto.randomUUID();

      set((state) => ({
        messages: [
          ...state.messages,
          { id: crypto.randomUUID(), role: "user", content: trimmed },
          {
            id: assistantId,
            role: "assistant",
            content: "",
            streaming: true,
            tools: [],
            cards: [],
          },
        ],
        isStreaming: true,
      }));

      const activeController = new AbortController();
      controller = activeController;

      try {
        for await (const chunk of streamChat({
          message: trimmed,
          conversationId: get().conversationId,
          visitorId: getVisitorId(),
          signal: activeController.signal,
        })) {
          switch (chunk.type) {
            case "token": {
              if (chunk.conversationId) {
                set({ conversationId: chunk.conversationId });
              }
              const content = chunk.content;
              if (content) {
                patchMessage(assistantId, (m) => ({
                  ...m,
                  content: m.content + content,
                }));
              }
              break;
            }

            case "tool_start": {
              const tool = chunk.tool;
              set({ activeTool: tool });
              if (tool) {
                patchMessage(assistantId, (m) => ({
                  ...m,
                  tools: [...(m.tools ?? []), tool],
                }));
              }
              break;
            }

            case "tool_end": {
              set({ activeTool: undefined });
              const card = toCard(chunk.tool, chunk.data);
              if (card) {
                patchMessage(assistantId, (m) => ({
                  ...m,
                  // Replace any earlier card from the same tool: a re-planned
                  // second call supersedes the first rather than stacking a
                  // duplicate list under the answer.
                  cards: [
                    ...(m.cards ?? []).filter((c) => c.tool !== card.tool),
                    card,
                  ],
                }));
              }
              break;
            }

            case "citations":
              patchMessage(assistantId, (m) => ({
                ...m,
                citations: chunk.citations,
              }));
              break;

            case "trace": {
              // Validated at the trust boundary like every other payload. A
              // malformed stage is dropped rather than rendered: the trace
              // claims to be a factual record of the run, so displaying a
              // half-parsed one would undermine the only reason it exists.
              const parsed = traceStageSchema.safeParse(chunk.trace);
              if (!parsed.success) break;

              patchMessage(assistantId, (m) => ({
                ...m,
                trace: [...(m.trace ?? []), parsed.data],
              }));
              break;
            }

            case "done":
              patchMessage(assistantId, (m) => ({ ...m, streaming: false }));
              break;

            case "error":
              patchMessage(assistantId, (m) => ({
                ...m,
                content:
                  m.content ||
                  chunk.content ||
                  "Something went wrong. Please try again.",
                failed: true,
                streaming: false,
              }));
              break;
          }
        }
      } catch (err) {
        // A deliberate stop() or reset() is not an error worth reporting.
        if (!activeController.signal.aborted) {
          patchMessage(assistantId, (m) => ({
            ...m,
            content:
              m.content ||
              (err instanceof Error
                ? err.message
                : "Connection lost. Please try again."),
            failed: true,
          }));
        }
      } finally {
        if (controller === activeController) controller = null;
        set({ isStreaming: false, activeTool: undefined });
        patchMessage(assistantId, (m) => ({ ...m, streaming: false }));
      }
    },
  };
});
