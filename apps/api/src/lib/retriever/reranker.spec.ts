import { Reranker } from "./reranker";
import { RetrievedChunk } from "./vector.repository";

describe("Reranker", () => {
  const reranker = new Reranker();

  const chunk = (
    id: string,
    content: string,
    score: number,
  ): RetrievedChunk => ({
    id,
    documentId: "d",
    content,
    title: "t",
    source: "MANUAL_UPLOAD",
    docType: "PROJECT",
    tags: [],
    score,
  });

  it("boosts chunks that overlap the query terms", () => {
    const chunks = [
      chunk("a", "This talks about cooking pasta and food.", 0.5),
      chunk(
        "b",
        "The Immortalis project uses pgvector and NestJS for RAG.",
        0.5,
      ),
    ];
    const ranked = reranker.rerank(
      "Tell me about the Immortalis pgvector project",
      chunks,
      2,
    );
    expect(ranked[0].id).toBe("b");
  });

  it("respects topN", () => {
    const chunks = [
      chunk("a", "x", 0.9),
      chunk("b", "y", 0.8),
      chunk("c", "z", 0.7),
    ];
    expect(reranker.rerank("anything", chunks, 2)).toHaveLength(2);
  });
});
