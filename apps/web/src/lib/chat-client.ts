import type { ChatStreamChunk } from '@ai-portfolio/shared';

/**
 * Streams a chat response from the NestJS SSE endpoint using fetch + a
 * ReadableStream reader. Yields parsed ChatStreamChunk events as they arrive.
 */
export async function* streamChat(params: {
  message: string;
  conversationId?: string;
  visitorId: string;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamChunk> {
  const res = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.message,
      conversationId: params.conversationId,
      visitorId: params.visitorId,
    }),
    signal: params.signal,
  });

  if (!res.body) throw new Error('No response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const evt of events) {
      const line = evt.replace(/^data:\s?/, '').trim();
      if (!line || line === '[DONE]') continue;
      try {
        yield JSON.parse(line) as ChatStreamChunk;
      } catch {
        /* ignore malformed keepalive */
      }
    }
  }
}

export function getVisitorId(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'ap_visitor_id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}
