import { Global, Module } from "@nestjs/common";
import { AgentOrchestrator } from "../../lib/agent/agent.orchestrator";
import { IntentDetector } from "../../lib/agent/intent.detector";
import { Planner } from "../../lib/agent/planner";
import { TOOL_CATALOGUE } from "../../lib/agent/tool-catalogue";
import { Synthesizer } from "../../lib/agent/synthesizer";
import { ToolExecutor } from "../../lib/agent/tool.executor";
import { IngestionService } from "../../lib/embeddings/ingestion.service";
import { MemoryService } from "../../lib/memory/memory.service";
import { Reranker } from "../../lib/retriever/reranker";
import { RetrieverService } from "../../lib/retriever/retriever.service";
import { JobDescriptionAnalyzerTool } from "../../lib/tools/job-analyzer.tool";
import {
  DocumentSearchTool,
  KnowledgeSearchTool,
} from "../../lib/tools/knowledge.tool";
import {
  ContactTool,
  ExperienceTool,
  ProjectSearchTool,
  ResumeTool,
  SkillsTool,
} from "../../lib/tools/portfolio.tools";
import { ToolRegistry } from "../../lib/tools/tool.registry";
import {
  CalculatorTool,
  CurrentTimeTool,
  GithubTool,
  RecommendationTool,
} from "../../lib/tools/utility.tools";

/** The twelve agent capabilities. */
const TOOLS = [
  KnowledgeSearchTool,
  DocumentSearchTool,
  ResumeTool,
  ProjectSearchTool,
  SkillsTool,
  ExperienceTool,
  ContactTool,
  JobDescriptionAnalyzerTool,
  CurrentTimeTool,
  CalculatorTool,
  GithubTool,
  RecommendationTool,
];

/** The four pipeline nodes plus the orchestrator that sequences them. */
const AGENT_PIPELINE = [
  IntentDetector,
  Planner,
  ToolExecutor,
  Synthesizer,
  AgentOrchestrator,
];

/**
 * Wires the AI core: retrieval, memory, tools, ingestion, and the agent.
 *
 * Global because nearly every feature module needs the orchestrator or the
 * retriever, and threading them through imports would add noise without adding
 * isolation — the meaningful boundary is already enforced by the ports.
 */
@Global()
@Module({
  providers: [
    Reranker,
    RetrieverService,
    MemoryService,
    IngestionService,
    ...TOOLS,
    ToolRegistry,
    // The planner sees only the narrow catalogue view of the registry.
    { provide: TOOL_CATALOGUE, useExisting: ToolRegistry },
    ...AGENT_PIPELINE,
  ],
  exports: [
    RetrieverService,
    MemoryService,
    IngestionService,
    ToolRegistry,
    AgentOrchestrator,
  ],
})
export class AgentModule {}
