import { Injectable } from "@nestjs/common";
import { RetrieverService } from "../retriever/retriever.service";
import { Tool, ToolContext, ToolOutput } from "./tool.interface";

/** General semantic knowledge-base search across every ingested document. */
@Injectable()
export class KnowledgeSearchTool implements Tool {
  readonly name = "knowledge_search";
  readonly description =
    "Semantic + keyword search across all ingested knowledge (resume, blogs, docs).";

  constructor(private readonly retriever: RetrieverService) {}

  async run(input: string, ctx: ToolContext): Promise<ToolOutput> {
    const res = await this.retriever.retrieve(input || ctx.query);
    if (!res.confident || res.chunks.length === 0) {
      return {
        ok: false,
        text: "No confident matches found in the knowledge base.",
      };
    }
    return {
      ok: true,
      text: res.context,
      citations: res.citations,
      data: res.chunks,
    };
  }
}

/** Retrieval scoped to uploaded documents (resume PDFs, certificates, etc.). */
@Injectable()
export class DocumentSearchTool implements Tool {
  readonly name = "document_search";
  readonly description =
    "Search specifically within uploaded documents (resume, certificates, PDFs).";

  constructor(private readonly retriever: RetrieverService) {}

  async run(input: string, ctx: ToolContext): Promise<ToolOutput> {
    const res = await this.retriever.retrieve(input || ctx.query, {
      sources: ["MANUAL_UPLOAD"],
    });
    if (res.chunks.length === 0)
      return { ok: false, text: "No matching documents." };
    return {
      ok: true,
      text: res.context,
      citations: res.citations,
      data: res.chunks,
    };
  }
}
