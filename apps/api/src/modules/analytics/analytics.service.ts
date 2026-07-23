import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/config/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async track(
    type: string,
    visitorId?: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.analyticsEvent.create({
      data: { type, visitorId, payload: (payload as any) ?? undefined },
    });
  }

  async summary() {
    const [visitors, questions, downloads, conversations] = await Promise.all([
      this.prisma.analyticsEvent.count({ where: { type: "visit" } }),
      this.prisma.analyticsEvent.count({ where: { type: "question" } }),
      this.prisma.analyticsEvent.count({ where: { type: "download_resume" } }),
      this.prisma.conversation.count(),
    ]);

    const questionEvents = await this.prisma.analyticsEvent.findMany({
      where: { type: "question" },
      select: { payload: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
    const keywordCounts = new Map<string, number>();
    for (const e of questionEvents) {
      const msg = String((e.payload as any)?.message ?? "").toLowerCase();
      for (const w of msg.split(/\s+/).filter((x) => x.length > 4)) {
        keywordCounts.set(w, (keywordCounts.get(w) ?? 0) + 1);
      }
    }
    const topQuestions = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, count]) => ({ term, count }));

    const messagesPerConversation = conversations
      ? (await this.prisma.message.count()) / conversations
      : 0;

    return {
      visitors,
      questions,
      resumeDownloads: downloads,
      conversations,
      avgChatLength: Number(messagesPerConversation.toFixed(1)),
      topKeywords: topQuestions,
    };
  }
}
