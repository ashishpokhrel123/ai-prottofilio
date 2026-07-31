import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { RetrieverService } from "../retriever/retriever.service";
import { OWNER_CONTACT } from "../prompts/system.prompts";
import {
  emptyOutput,
  type Tool,
  type ToolContext,
  type ToolOutput,
} from "./tool.interface";

const MAX_PROJECTS_RETURNED = 6;

/** Résumé content, retrieved from the résumé/experience/education documents. */
@Injectable()
export class ResumeTool implements Tool {
  readonly name = "resume_tool";
  readonly description =
    "Fetch resume content: professional summary, work experience, and education.";

  constructor(private readonly retriever: RetrieverService) {}

  async run(input: string, ctx: ToolContext): Promise<ToolOutput> {
    const result = await this.retriever.retrieveSafely(input || ctx.query, {
      docTypes: ["RESUME", "EXPERIENCE", "EDUCATION"],
    });

    if (result.chunks.length === 0) {
      return emptyOutput("No resume content has been indexed yet.", "no_data");
    }

    return { ok: true, text: result.context, citations: result.citations };
  }
}

/**
 * Structured project lookup.
 *
 * Reads from the `Project` table rather than the vector store: project facts
 * are structured data, and returning them deterministically means the model
 * cannot invent a tech stack or misattribute a repository.
 */
@Injectable()
export class ProjectSearchTool implements Tool {
  readonly name = "project_search";
  readonly description =
    "Find projects by name, technology, or topic (AI, backend, blockchain, AWS, ...).";

  constructor(private readonly prisma: PrismaService) {}

  async run(input: string): Promise<ToolOutput> {
    const projects = await this.prisma.project.findMany({
      orderBy: [{ featured: "desc" }, { order: "asc" }],
    });

    if (projects.length === 0)
      return emptyOutput("No projects recorded.", "no_data");

    const matched = this.match(projects, input);
    const selected = (matched.length > 0 ? matched : projects).slice(
      0,
      MAX_PROJECTS_RETURNED,
    );

    return {
      ok: true,
      text: selected.map(renderProject).join("\n"),
      data: selected,
    };
  }

  private match<
    T extends {
      name: string;
      summary: string;
      technologies: string[];
      tags: string[];
    },
  >(projects: T[], input: string): T[] {
    const query = input.trim().toLowerCase();
    if (!query) return [];

    const queryTerms = new Set(query.split(/\s+/).filter((t) => t.length > 1));

    return projects.filter((project) => {
      const haystack = [
        project.name,
        project.summary,
        ...project.technologies,
        ...project.tags,
      ]
        .join(" ")
        .toLowerCase();

      if (haystack.includes(query)) return true;

      // Fall back to term-level matching so "rust backend" still finds a
      // project tagged only "rust".
      return [...project.technologies, ...project.tags].some((label) =>
        queryTerms.has(label.toLowerCase()),
      );
    });
  }
}

/** Skills grouped by category. */
@Injectable()
export class SkillsTool implements Tool {
  readonly name = "skills_tool";
  readonly description =
    "List technical skills grouped by category, with proficiency levels.";

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<ToolOutput> {
    const skills = await this.prisma.skill.findMany({
      orderBy: [{ category: "asc" }, { level: "desc" }],
    });

    if (skills.length === 0)
      return emptyOutput("No skills recorded.", "no_data");

    const grouped = new Map<string, { name: string; level: number }[]>();
    for (const skill of skills) {
      const entries = grouped.get(skill.category) ?? [];
      entries.push({ name: skill.name, level: skill.level });
      grouped.set(skill.category, entries);
    }

    // The prose the model reads and the structured payload the UI renders are
    // derived from the same grouping, so a card can never disagree with the
    // answer describing it.
    const text = [...grouped.entries()]
      .map(
        ([category, items]) =>
          `**${category}**: ${items
            .map((s) => `${s.name} (${s.level}/5)`)
            .join(", ")}`,
      )
      .join("\n");

    return { ok: true, text, data: Object.fromEntries(grouped) };
  }
}

/** Work-experience timeline. */
@Injectable()
export class ExperienceTool implements Tool {
  readonly name = "experience_tool";
  readonly description =
    "Return the work-experience timeline with roles, dates, and highlights.";

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<ToolOutput> {
    const experiences = await this.prisma.experience.findMany({
      orderBy: { startDate: "desc" },
    });

    if (experiences.length === 0)
      return emptyOutput("No experience recorded.", "no_data");

    const text = experiences
      .map((exp) => {
        const end = exp.current
          ? "present"
          : (exp.endDate?.getFullYear() ?? "unknown");
        const highlights = exp.highlights.map((h) => `- ${h}`).join("\n");

        return (
          `**${exp.role} — ${exp.company}** (${exp.startDate.getFullYear()}–${end})\n` +
          `${exp.description}\n${highlights}`
        );
      })
      .join("\n\n");

    return { ok: true, text, data: experiences };
  }
}

/** Contact details. Static, so it works even with an empty knowledge base. */
@Injectable()
export class ContactTool implements Tool {
  readonly name = "contact_tool";
  readonly description = "Return contact details and the resume download link.";

  async run(): Promise<ToolOutput> {
    const text = [
      `Email: ${OWNER_CONTACT.email}`,
      `LinkedIn: ${OWNER_CONTACT.linkedin}`,
      `GitHub: ${OWNER_CONTACT.github}`,
      "Resume: downloadable from the portfolio header.",
    ].join("\n");

    return { ok: true, text, data: OWNER_CONTACT };
  }
}

function renderProject(project: {
  name: string;
  summary: string;
  technologies: string[];
  githubUrl: string | null;
  liveUrl: string | null;
}): string {
  return [
    `### ${project.name}`,
    project.summary,
    `Tech: ${project.technologies.join(", ")}`,
    project.githubUrl ? `GitHub: ${project.githubUrl}` : null,
    project.liveUrl ? `Live: ${project.liveUrl}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
