import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { errorMessage } from "../../core/errors/domain.errors";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";

/** Closed set of event types, so a typo can't create a phantom metric. */
export const ANALYTICS_EVENTS = [
  "visit",
  "question",
  "project_view",
  "skill_query",
  "download_resume",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsSummary {
  readonly visitors: number;
  readonly questions: number;
  readonly resumeDownloads: number;
  readonly conversations: number;
  readonly avgChatLength: number;
  readonly topKeywords: readonly { term: string; count: number }[];
}

/** Words that dominate any keyword count without carrying meaning. */
const KEYWORD_STOP_WORDS = new Set([
  "about",
  "there",
  "these",
  "those",
  "which",
  "would",
  "could",
  "should",
  "their",
  "where",
  "what",
  "your",
  "have",
  "with",
  "this",
  "that",
  "from",
  "tell",
  "does",
  "make",
  "been",
  "more",
  "than",
  "into",
  "some",
  "them",
]);

const SAMPLE_SIZE = 500;
const TOP_KEYWORDS = 10;
const MIN_KEYWORD_LENGTH = 5;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async track(
    type: AnalyticsEventType,
    visitorId?: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.analyticsEvent.create({
      data: {
        type,
        visitorId,
        payload: payload as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * Fire-and-forget variant. Analytics is observability, not a feature —
   * a failed insert must never break the request that triggered it.
   */
  async trackSafely(
    type: AnalyticsEventType,
    visitorId?: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.track(type, visitorId, payload);
    } catch (err) {
      this.logger.warn(
        `Analytics write failed (${type}): ${errorMessage(err)}`,
      );
    }
  }

  async summary(): Promise<AnalyticsSummary> {
    const [visitors, questions, resumeDownloads, conversations, messages] =
      await this.prisma.$transaction([
        this.prisma.analyticsEvent.count({ where: { type: "visit" } }),
        this.prisma.analyticsEvent.count({ where: { type: "question" } }),
        this.prisma.analyticsEvent.count({
          where: { type: "download_resume" },
        }),
        this.prisma.conversation.count(),
        this.prisma.message.count(),
      ]);

    return {
      visitors,
      questions,
      resumeDownloads,
      conversations,
      avgChatLength:
        conversations === 0 ? 0 : Number((messages / conversations).toFixed(1)),
      topKeywords: await this.topKeywords(),
    };
  }

  /**
   * Naive term frequency over recent questions.
   *
   * Sampled rather than exhaustive: this powers a dashboard tile, and scanning
   * the full event table for it would get slower every week for no added value.
   */
  private async topKeywords(): Promise<{ term: string; count: number }[]> {
    const events = await this.prisma.analyticsEvent.findMany({
      where: { type: "question" },
      select: { payload: true },
      orderBy: { createdAt: "desc" },
      take: SAMPLE_SIZE,
    });

    const counts = new Map<string, number>();

    for (const event of events) {
      const payload = event.payload as { message?: unknown } | null;
      if (typeof payload?.message !== "string") continue;

      for (const word of payload.message.toLowerCase().split(/\W+/)) {
        if (word.length < MIN_KEYWORD_LENGTH) continue;
        if (KEYWORD_STOP_WORDS.has(word)) continue;
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_KEYWORDS)
      .map(([term, count]) => ({ term, count }));
  }
}
