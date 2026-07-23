import { Injectable } from "@nestjs/common";
import { GeminiService } from "../llm/gemini.service";

/**
 * Embeddings facade. Today it delegates to Gemini; swapping providers
 * only touches this file (Open/Closed principle).
 */
@Injectable()
export class EmbeddingsService {
  constructor(private readonly gemini: GeminiService) {}

  embedQuery(text: string): Promise<number[]> {
    return this.gemini.embed(this.normalize(text));
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.gemini.embedBatch(texts.map((t) => this.normalize(t)));
  }

  private normalize(text: string): string {
    return text.replace(/\s+/g, " ").trim().slice(0, 8000);
  }
}
