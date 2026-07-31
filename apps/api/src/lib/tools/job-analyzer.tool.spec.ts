import type { JobFitResult } from "@ai-portfolio/shared";
import type { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { JobDescriptionAnalyzerTool } from "./job-analyzer.tool";

const CTX = { query: "", conversationId: "c1" };

function makeTool(
  skills: string[] = ["TypeScript", "NestJS", "PostgreSQL"],
  projects: {
    name: string;
    summary: string;
    technologies: string[];
    tags: string[];
  }[] = [
    {
      name: "Immortalis",
      summary: "A digital legacy platform",
      technologies: ["NestJS", "PostgreSQL"],
      tags: ["backend"],
    },
  ],
) {
  const prisma = {
    skill: {
      findMany: jest.fn().mockResolvedValue(skills.map((name) => ({ name }))),
    },
    project: { findMany: jest.fn().mockResolvedValue(projects) },
  } as unknown as PrismaService;

  return new JobDescriptionAnalyzerTool(prisma);
}

const JD =
  "We are looking for a backend engineer with strong TypeScript and NestJS " +
  "experience. You will work with PostgreSQL and help build our platform. " +
  "Knowledge of Kubernetes and Terraform would be a plus.";

describe("JobDescriptionAnalyzerTool", () => {
  it("refuses input too short to be a job description", async () => {
    const result = await makeTool().run("hiring?", CTX);

    expect(result.ok).toBe(false);
    expect(result.text).toContain("paste the full posting");
  });

  describe("scoring", () => {
    it("produces a score within 0..100", async () => {
      const result = await makeTool().run(JD, CTX);
      const data = result.data as JobFitResult;

      expect(data.score).toBeGreaterThanOrEqual(0);
      expect(data.score).toBeLessThanOrEqual(100);
    });

    it("identifies skills named in the posting", async () => {
      const data = (await makeTool().run(JD, CTX)).data as JobFitResult;

      expect(data.matchedSkills).toEqual(
        expect.arrayContaining(["TypeScript", "NestJS", "PostgreSQL"]),
      );
    });

    it("scores a candidate with no matching skills below one who matches", async () => {
      const strong = (await makeTool().run(JD, CTX)).data as JobFitResult;
      const weak = (await makeTool(["COBOL", "Fortran"], []).run(JD, CTX))
        .data as JobFitResult;

      expect(weak.score).toBeLessThan(strong.score);
    });

    it("caps the contribution of relevant projects", async () => {
      const many = Array.from({ length: 10 }, (_, i) => ({
        name: `Project ${i}`,
        summary: "backend platform",
        technologies: ["NestJS"],
        tags: ["backend"],
      }));

      const data = (await makeTool(["NestJS"], many).run(JD, CTX))
        .data as JobFitResult;

      // At most 3 projects are reported, and project points are capped at 30.
      expect(data.strongProjects.length).toBeLessThanOrEqual(3);
      expect(data.score).toBeLessThanOrEqual(100);
    });

    it("is deterministic — the same input always scores the same", async () => {
      const first = (await makeTool().run(JD, CTX)).data as JobFitResult;
      const second = (await makeTool().run(JD, CTX)).data as JobFitResult;

      // The number is computed in code precisely so it can't be hallucinated
      // or drift between identical questions.
      expect(first.score).toBe(second.score);
    });
  });

  describe("gap reporting", () => {
    it("does not report English filler words as missing skills", async () => {
      const data = (await makeTool().run(JD, CTX)).data as JobFitResult;

      for (const filler of ["the", "with", "you", "will", "experience"]) {
        expect(data.missingSkills).not.toContain(filler);
      }
    });

    it("reports at most eight gaps", async () => {
      const data = (await makeTool([], []).run(JD, CTX)).data as JobFitResult;

      expect(data.missingSkills.length).toBeLessThanOrEqual(8);
    });
  });

  describe("output shape", () => {
    it("renders a summary the model can quote verbatim", async () => {
      const result = await makeTool().run(JD, CTX);

      expect(result.ok).toBe(true);
      expect(result.text).toContain("JOB FIT ANALYSIS");
      expect(result.text).toMatch(/Score: \d+\/100/);
      expect(result.text).toContain("Matched skills:");
      expect(result.text).toContain("Likely gaps:");
    });

    it("handles an empty database without throwing", async () => {
      const result = await makeTool([], []).run(JD, CTX);

      expect(result.ok).toBe(true);
      expect((result.data as JobFitResult).score).toBe(0);
    });
  });
});
