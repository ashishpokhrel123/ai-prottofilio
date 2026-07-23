import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

export interface LlmMessage {
  role: "user" | "model";
  content: string;
}

/**
 * Thin wrapper around Google Gemini for both generation and embeddings.
 * Kept behind this service so the rest of the app depends on an interface,
 * not on the vendor SDK (Dependency Inversion).
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly client: GoogleGenerativeAI;
  private readonly llm: GenerativeModel;
  private readonly embedModelName: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("gemini.apiKey") ?? "";
    this.client = new GoogleGenerativeAI(apiKey);
    this.llm = this.client.getGenerativeModel({
      model: this.config.get<string>("gemini.llmModel") ?? "gemini-2.5-pro",
    });
    this.embedModelName =
      this.config.get<string>("gemini.embeddingModel") ?? "text-embedding-004";
  }

  /** Single, non-streaming completion. */
  async complete(system: string, messages: LlmMessage[]): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: this.config.get<string>("gemini.llmModel") ?? "gemini-2.5-pro",
      systemInstruction: system,
    });
    const res = await model.generateContent({
      contents: messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      })),
    });
    return res.response.text();
  }

  /** Streaming completion — yields text deltas. */
  async *stream(
    system: string,
    messages: LlmMessage[],
  ): AsyncGenerator<string> {
    const model = this.client.getGenerativeModel({
      model: this.config.get<string>("gemini.llmModel") ?? "gemini-2.5-pro",
      systemInstruction: system,
    });
    const res = await model.generateContentStream({
      contents: messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      })),
    });
    for await (const chunk of res.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }

  /** Embed a single text into a vector. */
  async embed(text: string): Promise<number[]> {
    const model = this.client.getGenerativeModel({
      model: this.embedModelName,
    });
    const res = await model.embedContent(text);
    return res.embedding.values;
  }

  /** Batch embed. Falls back to sequential if batch endpoint unavailable. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const model = this.client.getGenerativeModel({
      model: this.embedModelName,
    });
    try {
      const res = await model.batchEmbedContents({
        requests: texts.map((t) => ({
          content: { role: "user", parts: [{ text: t }] },
        })),
      });
      return res.embeddings.map((e) => e.values);
    } catch (err) {
      this.logger.warn(
        `batchEmbed failed, falling back to sequential: ${String(err)}`,
      );
      const out: number[][] = [];
      for (const t of texts) out.push(await this.embed(t));
      return out;
    }
  }
}
