import { Injectable } from "@nestjs/common";
import { RetrieverService } from "../retriever/retriever.service";
import {
  emptyOutput,
  type Tool,
  type ToolContext,
  type ToolOutput,
} from "./tool.interface";

/** Semantic + keyword search across every ingested document. */
@Injectable()
export class KnowledgeSearchTool implements Tool {
  readonly name = "knowledge_search";
  readonly description =
    "Semantic and keyword search across all ingested knowledge (resume, blogs, docs, READMEs).";

  constructor(private readonly retriever: RetrieverService) {}

  async run(input: string, ctx: ToolContext): Promise<ToolOutput> {
    const result = await this.retriever.retrieveSafely(input || ctx.query);

    // Retrieval below the confidence floor is worse than no retrieval: it
    // gives the model plausible-looking but irrelevant context to anchor on.
    if (!result.confident || result.chunks.length === 0) {
      return {
        ...emptyOutput("No confident matches found in the knowledge base."),
        // Attached even on the empty path. "Searched, found candidates, none
        // cleared the floor" is the most interesting thing the trace can show
        // — dropping it here would make a working gate look like a dead one.
        retrieval: result.stats,
      };
    }

    return {
      ok: true,
      text: result.context,
      citations: result.citations,
      data: result.chunks,
      retrieval: result.stats,
    };
  }
}

/** Retrieval scoped to manually uploaded documents (résumé PDFs, certificates). */
@Injectable()
export class DocumentSearchTool implements Tool {
  readonly name = "document_search";
  readonly description =
    "Search specifically within uploaded documents (resume PDF, certificates, attachments).";

  constructor(private readonly retriever: RetrieverService) {}

  async run(input: string, ctx: ToolContext): Promise<ToolOutput> {
    const result = await this.retriever.retrieveSafely(input || ctx.query, {
      sources: ["MANUAL_UPLOAD"],
    });

    if (result.chunks.length === 0) {
      return {
        ...emptyOutput("No matching uploaded documents."),
        retrieval: result.stats,
      };
    }

    return {
      ok: true,
      text: result.context,
      citations: result.citations,
      data: result.chunks,
      retrieval: result.stats,
    };
  }
}
