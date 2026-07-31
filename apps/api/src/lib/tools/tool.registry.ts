import { Injectable, Logger } from "@nestjs/common";
import { JobDescriptionAnalyzerTool } from "./job-analyzer.tool";
import { DocumentSearchTool, KnowledgeSearchTool } from "./knowledge.tool";
import {
  ContactTool,
  ExperienceTool,
  ProjectSearchTool,
  ResumeTool,
  SkillsTool,
} from "./portfolio.tools";
import type { Tool } from "./tool.interface";
import {
  CalculatorTool,
  CurrentTimeTool,
  GithubTool,
  RecommendationTool,
} from "./utility.tools";

/**
 * Central tool registry.
 *
 * The planner references tools by name and the executor resolves them here.
 * Registration is a single constructor list, so adding a capability touches
 * this file and nothing else in the agent.
 */
@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly tools: ReadonlyMap<string, Tool>;

  constructor(
    knowledgeSearch: KnowledgeSearchTool,
    documentSearch: DocumentSearchTool,
    resume: ResumeTool,
    projectSearch: ProjectSearchTool,
    skills: SkillsTool,
    experience: ExperienceTool,
    contact: ContactTool,
    jobAnalyzer: JobDescriptionAnalyzerTool,
    currentTime: CurrentTimeTool,
    calculator: CalculatorTool,
    github: GithubTool,
    recommendations: RecommendationTool,
  ) {
    const registered: Tool[] = [
      knowledgeSearch,
      documentSearch,
      resume,
      projectSearch,
      skills,
      experience,
      contact,
      jobAnalyzer,
      currentTime,
      calculator,
      github,
      recommendations,
    ];

    const map = new Map<string, Tool>();
    for (const tool of registered) {
      // A duplicate name would silently shadow a capability — fail loudly at
      // boot instead of debugging it at 2am.
      if (map.has(tool.name)) {
        throw new Error(`Duplicate tool name registered: "${tool.name}"`);
      }
      map.set(tool.name, tool);
    }

    this.tools = map;
    this.logger.log(`Registered ${map.size} agent tools.`);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): readonly Tool[] {
    return [...this.tools.values()];
  }

  /** Rendered tool list injected into the planner prompt. */
  catalogue(): string {
    return this.list()
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join("\n");
  }
}
