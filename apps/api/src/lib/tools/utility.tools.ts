import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/config/prisma.service";
import { Tool, ToolOutput } from "./tool.interface";

@Injectable()
export class CurrentTimeTool implements Tool {
  readonly name = "current_time";
  readonly description = "Return the current date and time (UTC).";
  async run(): Promise<ToolOutput> {
    return {
      ok: true,
      text: `Current time (UTC): ${new Date().toISOString()}`,
    };
  }
}

@Injectable()
export class CalculatorTool implements Tool {
  readonly name = "calculator";
  readonly description =
    "Evaluate a simple arithmetic expression, e.g. years of experience math.";
  async run(input: string): Promise<ToolOutput> {
    if (!/^[-+*/().\d\s]+$/.test(input)) {
      return { ok: false, text: "Only basic arithmetic is supported." };
    }
    try {
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${input});`)();
      return { ok: true, text: `${input} = ${value}`, data: value };
    } catch {
      return { ok: false, text: "Could not evaluate expression." };
    }
  }
}

@Injectable()
export class GithubTool implements Tool {
  readonly name = "github_tool";
  readonly description =
    "Return synced GitHub repositories, languages, stars, and READMEs.";
  constructor(private readonly prisma: PrismaService) {}
  async run(): Promise<ToolOutput> {
    const repos = await this.prisma.document.findMany({
      where: { source: "GITHUB" },
      take: 8,
      orderBy: { updatedAt: "desc" },
    });
    if (repos.length === 0)
      return { ok: false, text: "GitHub not synced yet." };
    const text = repos
      .map(
        (r: any) =>
          `**${r.title}** — ${(r.metadata as any)?.language ?? ""} ⭐${(r.metadata as any)?.stars ?? 0}`,
      )
      .join("\n");
    return { ok: true, text, data: repos };
  }
}

@Injectable()
export class RecommendationTool implements Tool {
  readonly name = "recommendation_engine";
  readonly description =
    "Recommend the most relevant projects for a given role or interest.";
  constructor(private readonly prisma: PrismaService) {}
  async run(input: string): Promise<ToolOutput> {
    const focus = (input ?? "").toLowerCase();
    const projects = await this.prisma.project.findMany();
    const ranked = projects
      .map((p: any) => ({
        p,
        score: [...p.technologies, ...p.tags].filter((t) =>
          focus.includes(t.toLowerCase()),
        ).length,
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 3);
    const text = ranked
      .map((r: any) => `- ${r.p.name}: ${r.p.summary}`)
      .join("\n");
    return {
      ok: true,
      text: text || "No recommendations.",
      data: ranked.map((r: any) => r.p),
    };
  }
}
