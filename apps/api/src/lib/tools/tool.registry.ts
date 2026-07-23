import { Injectable } from "@nestjs/common";
import { Tool } from "./tool.interface";
import { KnowledgeSearchTool, DocumentSearchTool } from "./knowledge.tool";
import {
  ResumeTool,
  ProjectSearchTool,
  SkillsTool,
  ExperienceTool,
  ContactTool,
} from "./portfolio.tools";
import { JobDescriptionAnalyzerTool } from "./job-analyzer.tool";
import {
  CurrentTimeTool,
  CalculatorTool,
  GithubTool,
  RecommendationTool,
} from "./utility.tools";

/**
 * Central registry. The planner references tools by name; the executor
 * looks them up here. Adding a tool = add to this constructor list.
 */
@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(
    knowledge: KnowledgeSearchTool,
    documents: DocumentSearchTool,
    resume: ResumeTool,
    projects: ProjectSearchTool,
    skills: SkillsTool,
    experience: ExperienceTool,
    contact: ContactTool,
    jd: JobDescriptionAnalyzerTool,
    time: CurrentTimeTool,
    calc: CalculatorTool,
    github: GithubTool,
    recommend: RecommendationTool,
  ) {
    [
      knowledge,
      documents,
      resume,
      projects,
      skills,
      experience,
      contact,
      jd,
      time,
      calc,
      github,
      recommend,
    ].forEach((t) => this.tools.set(t.name, t));
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  catalogue(): string {
    return this.list()
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");
  }
}
