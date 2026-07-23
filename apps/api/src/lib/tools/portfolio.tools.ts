import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/config/prisma.service";
import { RetrieverService } from "../retriever/retriever.service";
import { Tool, ToolContext, ToolOutput } from "./tool.interface";

/** Structured resume facts (falls back to retrieval over the resume document). */
@Injectable()
export class ResumeTool implements Tool {
  readonly name = "resume_tool";
  readonly description =
    "Fetch structured resume content: summary, experience, education.";

  constructor(
    private readonly prisma: PrismaService,
    private readonly retriever: RetrieverService,
  ) {}

  async run(input: string, ctx: ToolContext): Promise<ToolOutput> {
    const res = await this.retriever.retrieve(input || ctx.query, {
      docTypes: ["RESUME", "EXPERIENCE", "EDUCATION"],
    });
    return {
      ok: res.chunks.length > 0,
      text: res.context || "No resume content indexed yet.",
      citations: res.citations,
    };
  }
}

/** Structured project search from the projects table + semantic fallback. */
@Injectable()
export class ProjectSearchTool implements Tool {
  readonly name = "project_search";
  readonly description =
    "Find projects by name, technology, or topic (AI, backend, blockchain, AWS...).";

  constructor(private readonly prisma: PrismaService) {}

  async run(input: string): Promise<ToolOutput> {
    const q = (input ?? "").toLowerCase();
    const projects = await this.prisma.project.findMany({
      orderBy: { order: "asc" },
    });
    const matched = q
      ? projects.filter(
          (p: any) =>
            [p.name, p.summary, ...p.technologies, ...p.tags]
              .join(" ")
              .toLowerCase()
              .includes(q) ||
            q
              .split(/\s+/)
              .some((t) =>
                [...p.technologies, ...p.tags]
                  .map((x) => x.toLowerCase())
                  .includes(t),
              ),
        )
      : projects;
    const list = (matched.length ? matched : projects).slice(0, 6);
    const text = list
      .map(
        (p: any) =>
          `### ${p.name}\n${p.summary}\nTech: ${p.technologies.join(", ")}\n` +
          (p.githubUrl ? `GitHub: ${p.githubUrl}\n` : "") +
          (p.liveUrl ? `Live: ${p.liveUrl}\n` : ""),
      )
      .join("\n");
    return {
      ok: list.length > 0,
      text: text || "No projects found.",
      data: list,
    };
  }
}

/** Skills grouped by category. */
@Injectable()
export class SkillsTool implements Tool {
  readonly name = "skills_tool";
  readonly description =
    "List skills, optionally filtered by category or keyword.";

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<ToolOutput> {
    const skills = await this.prisma.skill.findMany({
      orderBy: [{ category: "asc" }, { level: "desc" }],
    });
    const grouped: Record<string, string[]> = {};
    for (const s of skills)
      (grouped[s.category] ??= []).push(`${s.name} (${s.level}/5)`);
    const text = Object.entries(grouped)
      .map(([cat, items]) => `**${cat}**: ${items.join(", ")}`)
      .join("\n");
    return {
      ok: skills.length > 0,
      text: text || "No skills recorded.",
      data: grouped,
    };
  }
}

/** Work experience timeline. */
@Injectable()
export class ExperienceTool implements Tool {
  readonly name = "experience_tool";
  readonly description =
    "Return work experience timeline with roles and highlights.";

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<ToolOutput> {
    const xp = await this.prisma.experience.findMany({
      orderBy: { startDate: "desc" },
    });
    const text = xp
      .map(
        (e: any) =>
          `**${e.role} — ${e.company}** (${e.startDate.getFullYear()}–${e.current ? "present" : (e.endDate?.getFullYear() ?? "")})\n` +
          `${e.description}\n${e.highlights.map((h: string) => `- ${h}`).join("\n")}`,
      )
      .join("\n\n");
    return {
      ok: xp.length > 0,
      text: text || "No experience recorded.",
      data: xp,
    };
  }
}

/** Contact info. */
@Injectable()
export class ContactTool implements Tool {
  readonly name = "contact_tool";
  readonly description = "Return contact details and resume download link.";

  async run(): Promise<ToolOutput> {
    return {
      ok: true,
      text: `Email: aashishpokhrel146@gmail.com\nLinkedIn: linkedin.com/in/ashishpokhrel\nGitHub: github.com/ashishpokhrel\nResume: available for download from the portfolio.`,
    };
  }
}
