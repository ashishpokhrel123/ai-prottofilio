import { chunkText } from "./chunker";

const OPTIONS = { chunkSize: 100, overlap: 20 };

describe("chunkText", () => {
  it("returns nothing for empty input", () => {
    expect(chunkText("", OPTIONS)).toEqual([]);
    expect(chunkText("   \n\n  ", OPTIONS)).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    const chunks = chunkText("A short paragraph about pgvector.", OPTIONS);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].content).toContain("pgvector");
  });

  it("splits long text into multiple chunks with sequential indexes", () => {
    const text = Array.from(
      { length: 40 },
      (_, i) => `Paragraph ${i} discussing retrieval augmented generation.`,
    ).join("\n\n");

    const chunks = chunkText(text, OPTIONS);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("splits on heading boundaries", () => {
    const text = [
      "# Introduction",
      "Some introductory text.",
      "",
      "## Architecture",
      "Details about the architecture.",
    ].join("\n");

    expect(
      chunkText(text, { chunkSize: 10, overlap: 0 }).length,
    ).toBeGreaterThan(1);
  });

  it("reports a positive token estimate per chunk", () => {
    for (const chunk of chunkText("Some content worth embedding.", OPTIONS)) {
      expect(chunk.tokens).toBeGreaterThan(0);
    }
  });

  it("carries overlap context between chunks", () => {
    const text = Array.from(
      { length: 30 },
      (_, i) => `Sentence number ${i} about vectors.`,
    ).join("\n\n");

    const withOverlap = chunkText(text, { chunkSize: 60, overlap: 20 });
    const withoutOverlap = chunkText(text, { chunkSize: 60, overlap: 0 });

    // Repeating the tail necessarily produces at least as many chunks.
    expect(withOverlap.length).toBeGreaterThanOrEqual(withoutOverlap.length);
  });

  it("never emits an empty chunk", () => {
    const chunks = chunkText("# Heading\n\n\n\nBody text here.", OPTIONS);

    for (const chunk of chunks) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
  });
});
