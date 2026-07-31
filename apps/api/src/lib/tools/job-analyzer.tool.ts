import { Injectable } from "@nestjs/common";
import type { JobFitResult } from "@ai-portfolio/shared";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import {
  emptyOutput,
  type Tool,
  type ToolContext,
  type ToolOutput,
} from "./tool.interface";

/** Scoring weights. Exported so the fit score is testable and auditable. */
export const FIT_WEIGHTS = Object.freeze({
  skillCoverage: 70,
  perStrongProject: 10,
  maxProjectPoints: 30,
});

const MAX_STRONG_PROJECTS = 3;
const MAX_REPORTED_GAPS = 8;
const MIN_JD_LENGTH = 40;

/**
 * English stop words plus job-posting boilerplate.
 *
 * Without this, phrases like "you will work with our team" get counted as
 * missing technical skills and drag the score down for no reason.
 */
const STOP_WORDS = new Set([
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
  "your",
  "that",
  "this",
  "from",
  "they",
  "their",
  "them",
  "who",
  "what",
  "team",
  "role",
  "job",
  "must",
  "should",
  "would",
  "can",
  "able",
  "years",
  "year",
  "experience",
  "strong",
  "good",
  "great",
  "excellent",
  "ability",
  "including",
  "such",
  "well",
  "using",
  "help",
  "build",
  "working",
  "across",
  "within",
  "into",
  "about",
  "more",
  "than",
  "also",
  "other",
  "any",
  "all",
  "new",
  "how",
  "why",
  "when",
  "where",
  "plus",
  "etc",
  "you'll",
  "we're",
]);

/**
 * Compares a pasted job description against the owner's skills and projects.
 *
 * The score is computed in code, never by the LLM — a hallucinated "94% match"
 * is exactly the kind of claim that destroys a recruiter's trust in the whole
 * portfolio. Deterministic scoring also makes the number reproducible.
 */
@Injectable()
export class JobDescriptionAnalyzerTool implements Tool {
  readonly name = "job_description_analyzer";
  readonly description =
    "Analyze a pasted job description and compute a fit score against skills and projects.";

  constructor(private readonly prisma: PrismaService) {}

  async run(input: string, ctx: ToolContext): Promise<ToolOutput> {
    const description = (input || ctx.query).toLowerCase();

    if (description.length < MIN_JD_LENGTH) {
      return emptyOutput(
        "No job description detected — paste the full posting for a fit analysis.",
      );
    }

    const [skills, projects] = await Promise.all([
      this.prisma.skill.findMany({ select: { name: true } }),
      this.prisma.project.findMany({
        select: { name: true, summary: true, technologies: true, tags: true },
      }),
    ]);

    const keywords = extractKeywords(description);
    const technicalKeywords = keywords.filter((k) => !STOP_WORDS.has(k));

    const matchedSkills = skills
      .map((s) => s.name)
      .filter((name) => description.includes(name.toLowerCase()));

    const missingSkills = technicalKeywords.filter(
      (keyword) => !skills.some((s) => s.name.toLowerCase().includes(keyword)),
    );

    const strongProjects = projects
      .map((project) => {
        const haystack = [
          ...project.technologies,
          ...project.tags,
          project.summary,
        ]
          .join(" ")
          .toLowerCase();

        const overlap = technicalKeywords.filter((k) =>
          haystack.includes(k),
        ).length;

        return {
          name: project.name,
          overlap,
          reason: `matches ${overlap} keyword${overlap === 1 ? "" : "s"} from the posting`,
        };
      })
      .filter((p) => p.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, MAX_STRONG_PROJECTS)
      .map(({ name, reason }) => ({ name, reason }));

    const score = this.computeScore(
      matchedSkills.length,
      technicalKeywords.length,
      strongProjects.length,
    );

    const result: JobFitResult = {
      score,
      matchedSkills,
      missingSkills: [...new Set(missingSkills)].slice(0, MAX_REPORTED_GAPS),
      strongProjects,
      summary:
        `Estimated fit ${score}/100, from ${matchedSkills.length} matched skill(s) ` +
        `and ${strongProjects.length} relevant project(s).`,
    };

    const text = [
      "JOB FIT ANALYSIS",
      `Score: ${score}/100`,
      `Matched skills: ${matchedSkills.join(", ") || "none detected"}`,
      `Likely gaps: ${result.missingSkills.join(", ") || "none obvious"}`,
      `Most relevant projects: ${strongProjects.map((p) => p.name).join(", ") || "n/a"}`,
    ].join("\n");

    return { ok: true, text, data: result };
  }

  private computeScore(
    matched: number,
    totalKeywords: number,
    strongProjects: number,
  ): number {
    const coverage = totalKeywords === 0 ? 0 : matched / totalKeywords;

    const projectPoints = Math.min(
      strongProjects * FIT_WEIGHTS.perStrongProject,
      FIT_WEIGHTS.maxProjectPoints,
    );

    return Math.min(
      100,
      Math.round(coverage * FIT_WEIGHTS.skillCoverage + projectPoints),
    );
  }
}

function extractKeywords(text: string): string[] {
  return [
    ...new Set(
      text
        // Keep +, # and . so "c++", "c#" and "node.js" survive tokenisation.
        .replace(/[^a-z0-9+.#\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2),
    ),
  ];
}
