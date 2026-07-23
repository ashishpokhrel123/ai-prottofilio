import { Injectable } from "@nestjs/common";
import { JobFitResult } from "@ai-portfolio/shared";
import { PrismaService } from "../../common/config/prisma.service";
import { Tool, ToolContext, ToolOutput } from "./tool.interface";

/**
 * Deterministically compares a pasted job description against the owner's
 * skills + projects and produces a match score. The number is computed in
 * code (not by the LLM) so it can't be hallucinated.
 */
@Injectable()
export class JobDescriptionAnalyzerTool implements Tool {
  readonly name = "job_description_analyzer";
  readonly description =
    "Analyze a job description and compute a fit score vs. skills and projects.";

  constructor(private readonly prisma: PrismaService) {}

  async run(input: string, ctx: ToolContext): Promise<ToolOutput> {
    const jd = (input || ctx.query).toLowerCase();
    const skills = await this.prisma.skill.findMany();
    const projects = await this.prisma.project.findMany();

    const skillNames = skills.map((s) => s.name);
    const jdTokens = this.extractKeywords(jd);

    const matchedSkills = skillNames.filter((s) =>
      jd.includes(s.toLowerCase()),
    );
    const missingSkills = jdTokens.filter(
      (t) =>
        !skillNames.some((s) => s.toLowerCase().includes(t)) &&
        this.looksLikeTech(t),
    );

    const strongProjects = projects
      .map((p) => {
        const hay = [...p.technologies, ...p.tags, p.summary]
          .join(" ")
          .toLowerCase();
        const overlap = jdTokens.filter((t) => hay.includes(t)).length;
        return {
          name: p.name,
          overlap,
          reason: `matches ${overlap} JD keyword(s)`,
        };
      })
      .filter((p) => p.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 3)
      .map(({ name, reason }: { name: string; reason: string }) => ({
        name,
        reason,
      }));

    const coverage =
      matchedSkills.length / Math.max(this.uniqueTech(jdTokens).length, 1);
    const score = Math.min(
      100,
      Math.round(coverage * 70 + strongProjects.length * 10),
    );

    const result: JobFitResult = {
      score,
      matchedSkills,
      missingSkills: Array.from(new Set(missingSkills)).slice(0, 8),
      strongProjects,
      summary: `Estimated fit ${score}/100 based on ${matchedSkills.length} matched skills and ${strongProjects.length} relevant projects.`,
    };

    const text =
      `JOB FIT ANALYSIS\nScore: ${score}/100\n` +
      `Matched skills: ${matchedSkills.join(", ") || "none detected"}\n` +
      `Likely gaps: ${result.missingSkills.join(", ") || "none obvious"}\n` +
      `Most relevant projects: ${strongProjects.map((p: { name: string }) => p.name).join(", ") || "n/a"}`;

    return { ok: true, text, data: result };
  }

  private extractKeywords(text: string): string[] {
    return Array.from(
      new Set(
        text
          .replace(/[^a-z0-9+.#\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 2),
      ),
    );
  }
  private uniqueTech(tokens: string[]): string[] {
    return tokens.filter((t) => this.looksLikeTech(t));
  }
  private looksLikeTech(t: string): boolean {
    const stop = new Set([
      "the",
      "and",
      "for",
      "with",
      "you",
      "our",
      "are",
      "will",
      "have",
      "work",
    ]);
    return !stop.has(t);
  }
}
