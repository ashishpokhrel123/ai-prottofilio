import type { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { skillGroupsSchema } from "@ai-portfolio/shared";
import {
  ExperienceTool,
  ProjectSearchTool,
  SkillsTool,
} from "./portfolio.tools";

function prismaWith(rows: {
  skill?: unknown[];
  project?: unknown[];
}): PrismaService {
  return {
    skill: { findMany: async () => rows.skill ?? [] },
    project: { findMany: async () => rows.project ?? [] },
  } as unknown as PrismaService;
}

describe("SkillsTool", () => {
  const skills = [
    { name: "NestJS", level: 5, category: "Backend" },
    { name: "Prisma", level: 4, category: "Backend" },
    { name: "React", level: 4, category: "Frontend" },
  ];

  it("returns structured groups the UI card schema accepts", async () => {
    const tool = new SkillsTool(prismaWith({ skill: skills }));
    const output = await tool.run();

    // The web client validates with this exact schema before rendering, so a
    // shape change here must fail the build rather than silently drop the card.
    const parsed = skillGroupsSchema.safeParse(output.data);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({
      Backend: [
        { name: "NestJS", level: 5 },
        { name: "Prisma", level: 4 },
      ],
      Frontend: [{ name: "React", level: 4 }],
    });
  });

  it("derives the prose from the same grouping as the data", async () => {
    const tool = new SkillsTool(prismaWith({ skill: skills }));
    const output = await tool.run();

    expect(output.text).toContain("**Backend**: NestJS (5/5), Prisma (4/5)");
    expect(output.text).toContain("**Frontend**: React (4/5)");
  });

  it("reports nothing recorded rather than an empty card", async () => {
    const tool = new SkillsTool(prismaWith({ skill: [] }));
    const output = await tool.run();

    expect(output.ok).toBe(false);
    expect(output.data).toBeUndefined();
  });

  it("tags an empty table as missing data, not as a failed match", async () => {
    const tool = new SkillsTool(prismaWith({ skill: [] }));
    const output = await tool.run();

    expect(output.emptyReason).toBe("no_data");
  });
});

describe("ExperienceTool", () => {
  /**
   * The bug that motivated `emptyReason`: an unseeded `Experience` table made
   * the assistant answer "I don't have that in my knowledge base yet", which
   * points at retrieval — a subsystem this tool never touches.
   */
  it("tags an empty table as missing data", async () => {
    const prisma = {
      experience: { findMany: async () => [] },
    } as unknown as PrismaService;

    const output = await new ExperienceTool(prisma).run();

    expect(output.ok).toBe(false);
    expect(output.emptyReason).toBe("no_data");
  });
});

describe("ProjectSearchTool", () => {
  const projects = [
    {
      id: "p1",
      slug: "immortalis",
      name: "Immortalis",
      summary: "Rust service.",
      technologies: ["Rust"],
      tags: ["backend"],
      githubUrl: null,
      liveUrl: null,
      featured: true,
    },
    {
      id: "p2",
      slug: "portfolio",
      name: "AI Portfolio",
      summary: "Agentic RAG.",
      technologies: ["NestJS"],
      tags: ["ai"],
      githubUrl: null,
      liveUrl: null,
      featured: false,
    },
  ];

  it("returns the matched rows as data so the card matches the prose", async () => {
    const tool = new ProjectSearchTool(prismaWith({ project: projects }));
    const output = await tool.run("rust");

    expect(output.ok).toBe(true);
    expect(output.data).toEqual([projects[0]]);
    expect(output.text).toContain("Immortalis");
    expect(output.text).not.toContain("AI Portfolio");
  });

  it("falls back to every project when nothing matches", async () => {
    const tool = new ProjectSearchTool(prismaWith({ project: projects }));
    const output = await tool.run("cobol mainframes");

    expect(output.data).toEqual(projects);
  });

  it("attaches no data when there are no projects at all", async () => {
    const tool = new ProjectSearchTool(prismaWith({ project: [] }));
    const output = await tool.run("anything");

    expect(output.ok).toBe(false);
    expect(output.data).toBeUndefined();
    expect(output.emptyReason).toBe("no_data");
  });
});
