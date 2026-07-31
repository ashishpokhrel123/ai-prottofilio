import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { errorMessage } from "../../core/errors/domain.errors";
import { evaluateExpression } from "./expression.evaluator";
import { emptyOutput, type Tool, type ToolOutput } from "./tool.interface";

@Injectable()
export class CurrentTimeTool implements Tool {
  readonly name = "current_time";
  readonly description = "Return the current date and time in UTC.";

  async run(): Promise<ToolOutput> {
    const now = new Date();
    return {
      ok: true,
      text: `Current time (UTC): ${now.toISOString()}`,
      data: { iso: now.toISOString(), epochMs: now.getTime() },
    };
  }
}

/**
 * Arithmetic for questions like "how many years is 2019 to 2025?".
 *
 * Backed by a hand-written parser rather than `eval`/`Function` — see
 * `expression.evaluator.ts`.
 */
@Injectable()
export class CalculatorTool implements Tool {
  readonly name = "calculator";
  readonly description =
    "Evaluate an arithmetic expression, e.g. computing years of experience.";

  async run(input: string): Promise<ToolOutput> {
    try {
      const value = evaluateExpression(input);
      return { ok: true, text: `${input.trim()} = ${value}`, data: value };
    } catch (err) {
      return emptyOutput(
        `Could not evaluate that expression: ${errorMessage(err)}`,
      );
    }
  }
}

interface RepoMetadata {
  readonly language?: string;
  readonly stars?: number;
  readonly url?: string;
}

@Injectable()
export class GithubTool implements Tool {
  readonly name = "github_tool";
  readonly description =
    "Return synced GitHub repositories with their languages, stars, and READMEs.";

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<ToolOutput> {
    const repos = await this.prisma.document.findMany({
      where: { source: "GITHUB" },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, title: true, metadata: true },
    });

    if (repos.length === 0) {
      return emptyOutput("GitHub has not been synced yet.", "not_configured");
    }

    const text = repos
      .map((repo) => {
        const meta = (repo.metadata ?? {}) as RepoMetadata;
        return `**${repo.title}** — ${meta.language ?? "unknown language"} · ${meta.stars ?? 0} stars`;
      })
      .join("\n");

    return { ok: true, text, data: repos };
  }
}

/** Suggests the projects most relevant to a stated role or interest. */
@Injectable()
export class RecommendationTool implements Tool {
  readonly name = "recommendation_engine";
  readonly description =
    "Recommend the most relevant projects for a given role, technology, or interest.";

  constructor(private readonly prisma: PrismaService) {}

  async run(input: string): Promise<ToolOutput> {
    const focus = input.trim().toLowerCase();
    if (!focus) return emptyOutput("No role or interest specified.");

    const projects = await this.prisma.project.findMany();
    if (projects.length === 0)
      return emptyOutput("No projects recorded.", "no_data");

    const ranked = projects
      .map((project) => ({
        project,
        score: [...project.technologies, ...project.tags].filter((label) =>
          focus.includes(label.toLowerCase()),
        ).length,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (ranked.length === 0) {
      return emptyOutput(`No projects clearly match "${input.trim()}".`);
    }

    return {
      ok: true,
      text: ranked
        .map((r) => `- ${r.project.name}: ${r.project.summary}`)
        .join("\n"),
      data: ranked.map((r) => r.project),
    };
  }
}
