import { Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "../../common/config/app-config.service";
import { isRetryableProviderError, retry } from "../../common/utils/retry";
import { errorMessage } from "../../core/errors/domain.errors";
import type { RerankerPort, RetrievedChunk } from "../../core/ports";
import { Reranker } from "../../lib/retriever/reranker";

/**
 * Cross-encoder re-ranking via NeMo Retriever.
 *
 * The second stage of two-stage retrieval. Bi-encoder search compares a query
 * and a passage that were embedded independently and never saw each other; a
 * cross-encoder reads the pair together, which is what lets it catch the case
 * the lexical re-ranker cannot — a passage that answers the question without
 * repeating its words.
 *
 * It costs a network round-trip on every query, which is why it is opt-in.
 */

/**
 * Guards the request body. The model's practical limit is 8192 tokens per
 * pair, and `RAG_TOP_K` passages of unbounded length would blow past it.
 * Chunks are far smaller than this in normal operation.
 */
const MAX_PASSAGE_CHARS = 8_000;

/** Re-ranking sits in the request path; a slow provider must not hang chat. */
const TIMEOUT_MS = 10_000;

interface RankingResponse {
  readonly rankings?: readonly { index: number; logit: number }[];
}

@Injectable()
export class NvidiaReranker implements RerankerPort {
  private readonly logger = new Logger(NvidiaReranker.name);

  readonly strategy: string;

  /** Fully-qualified ranking URL, resolved once at construction. */
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(
    config: AppConfigService,
    /**
     * The fallback, injected rather than reimplemented.
     *
     * Re-ranking is a refinement of an already-usable list, so a NIM outage
     * or a burnt rate limit should cost some relevance and nothing else. The
     * lexical pass is local, synchronous and always available — degrading to
     * it keeps chat answering during an incident.
     */
    private readonly fallback: Reranker,
  ) {
    const nvidia = config.nvidia;
    this.model = nvidia.rerankModel;
    this.apiKey = nvidia.apiKey;
    // Both halves come from `buildConfig`, which defaults the host to the
    // reranking one rather than the chat one, and derives the per-model path.
    // No fallback here on purpose: the obvious one — reuse `NVIDIA_BASE_URL`
    // with a flat `/ranking` — is exactly the pair of mistakes this avoids.
    this.endpoint = `${nvidia.rerankBaseUrl.replace(/\/+$/, "")}${nvidia.rerankPath}`;
    this.strategy = this.model;

    if (!nvidia.isConfigured) {
      this.logger.warn(
        "Re-ranking is set to NVIDIA but NVIDIA_API_KEY is unset — every " +
          "query will fall back to the local lexical re-ranker.",
      );
    }
  }

  async rerank(
    query: string,
    chunks: readonly RetrievedChunk[],
    topN: number,
  ): Promise<RetrievedChunk[]> {
    if (chunks.length === 0 || topN <= 0) return [];

    // Nothing to rank. Skipping the call also skips a round-trip that could
    // only ever return the same list.
    if (chunks.length === 1) return [...chunks].slice(0, topN);

    try {
      const rankings = await this.rank(query, chunks);
      return this.applyRankings(chunks, rankings, topN);
    } catch (err) {
      this.logger.warn(
        `NVIDIA re-ranking failed (${errorMessage(err)}); ` +
          "falling back to lexical re-ranking for this query.",
      );
      return this.fallback.rerank(query, chunks, topN);
    }
  }

  private async rank(
    query: string,
    chunks: readonly RetrievedChunk[],
  ): Promise<readonly { index: number; logit: number }[]> {
    const body = JSON.stringify({
      model: this.model,
      query: { text: query },
      passages: chunks.map((c) => ({
        text: c.content.slice(0, MAX_PASSAGE_CHARS),
      })),
      truncate: "END",
    });

    const res = await retry(
      async () => {
        const response = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!response.ok) {
          const error = new Error(
            `Ranking request failed [${response.status}]: ${(
              await response.text()
            ).slice(0, 200)}`,
          );
          Object.assign(error, { status: response.status });
          throw error;
        }

        return response;
      },
      {
        // Deliberately shallow. The default four attempts with backoff can
        // exceed thirty seconds, and this runs while a visitor waits on a
        // chat response — a fast fallback beats a correct answer that arrives
        // after they have left.
        attempts: 2,
        baseDelayMs: 250,
        isRetryable: isRetryableProviderError,
      },
    );

    const json = (await res.json()) as RankingResponse;
    return json.rankings ?? [];
  }

  /**
   * Maps the returned ordering back onto the candidate chunks.
   *
   * Only `score` is rewritten, matching the lexical re-ranker's contract:
   * `similarity` remains the raw retrieval signal that the confidence gate
   * reads, and overwriting it with a cross-encoder logit would silently change
   * what `RAG_MIN_SIMILARITY` means.
   *
   * Logits are unbounded and not comparable across queries, so they are
   * min-max scaled to 0..1 within this candidate set — the same normalisation
   * the lexical re-ranker applies, for the same reason.
   */
  private applyRankings(
    chunks: readonly RetrievedChunk[],
    rankings: readonly { index: number; logit: number }[],
    topN: number,
  ): RetrievedChunk[] {
    // A response that references chunks we did not send, or that is empty, is
    // not something to paper over with a partial ranking.
    const valid = rankings.filter(
      (r) =>
        Number.isInteger(r.index) && r.index >= 0 && r.index < chunks.length,
    );

    if (valid.length === 0) {
      throw new Error("Ranking response contained no usable entries");
    }

    const logits = valid.map((r) => r.logit);
    const min = Math.min(...logits);
    const max = Math.max(...logits);
    const range = max - min;

    return valid
      .map((r) => ({
        ...chunks[r.index],
        score: range > Number.EPSILON ? (r.logit - min) / range : 1,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }
}
