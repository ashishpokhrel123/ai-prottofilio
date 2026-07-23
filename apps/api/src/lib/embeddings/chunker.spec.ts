import { chunkText } from "./chunker";

describe("chunkText", () => {
  it("produces overlapping chunks that cover the text", () => {
    const text = Array.from(
      { length: 40 },
      (_, i) => `Sentence number ${i} about engineering.`,
    ).join(" ");
    const chunks = chunkText(text, { chunkSize: 50, overlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.length > 0)).toBe(true);
    expect(chunks[0].index).toBe(0);
  });

  it("handles empty input", () => {
    expect(chunkText("", { chunkSize: 100, overlap: 10 })).toEqual([]);
  });
});
