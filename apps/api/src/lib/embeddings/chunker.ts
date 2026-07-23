export interface ChunkOptions {
  chunkSize: number; // approx tokens
  overlap: number;
}

export interface TextChunk {
  content: string;
  index: number;
  tokens: number;
}

/**
 * Heading-aware semantic chunker. Splits on markdown/section boundaries first,
 * then packs paragraphs up to `chunkSize` (approx tokens ≈ words * 1.3),
 * keeping `overlap` tokens of tail context between chunks.
 */
export function chunkText(text: string, opts: ChunkOptions): TextChunk[] {
  const clean = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const approxTokens = (s: string) => Math.ceil(s.split(/\s+/).length * 1.3);

  const getSubBlocks = (block: string): string[] => {
    if (approxTokens(block) <= opts.chunkSize) return [block];
    const sentences = block
      .split(/(?<=[.!?])\s+/g)
      .filter((s) => s.trim().length > 0);
    if (sentences.length <= 1) return [block];

    const res: string[] = [];
    let current = "";
    for (const sent of sentences) {
      if (current && approxTokens(current + " " + sent) > opts.chunkSize) {
        res.push(current);
        current = sent;
      } else {
        current = current ? current + " " + sent : sent;
      }
    }
    if (current) res.push(current);
    return res;
  };

  const rawBlocks = clean
    .split(/\n(?=#{1,6}\s)|\n\n/g)
    .filter((b) => b.trim().length > 0);
  const blocks = rawBlocks.flatMap((b) => getSubBlocks(b));

  const chunks: TextChunk[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;
  let index = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const content = buffer.join("\n\n").trim();
    chunks.push({ content, index: index++, tokens: approxTokens(content) });
    // build overlap tail
    if (opts.overlap > 0) {
      const words = content.split(/\s+/);
      const tail = words.slice(-Math.ceil(opts.overlap / 1.3)).join(" ");
      buffer = tail ? [tail] : [];
      bufferTokens = approxTokens(tail);
    } else {
      buffer = [];
      bufferTokens = 0;
    }
  };

  for (const block of blocks) {
    const t = approxTokens(block);
    if (bufferTokens + t > opts.chunkSize && buffer.length > 0) flush();
    buffer.push(block);
    bufferTokens += t;
  }
  flush();

  return chunks.filter((c) => c.content.length > 0);
}
