import { Global, Module } from "@nestjs/common";
import { GeminiService } from "../../lib/llm/gemini.service";
import { EmbeddingsService } from "../../lib/embeddings/embeddings.service";
import { VectorRepository } from "../../lib/retriever/vector.repository";
import { Reranker } from "../../lib/retriever/reranker";
import { RetrieverService } from "../../lib/retriever/retriever.service";
import { MemoryService } from "../../lib/memory/memory.service";
import { AgentOrchestrator } from "../../lib/agent/agent.orchestrator";
import { ToolRegistry } from "../../lib/tools/tool.registry";
import {
  KnowledgeSearchTool,
  DocumentSearchTool,
} from "../../lib/tools/knowledge.tool";
import {
  ResumeTool,
  ProjectSearchTool,
  SkillsTool,
  ExperienceTool,
  ContactTool,
} from "../../lib/tools/portfolio.tools";
import { JobDescriptionAnalyzerTool } from "../../lib/tools/job-analyzer.tool";
import {
  CurrentTimeTool,
  CalculatorTool,
  GithubTool,
  RecommendationTool,
} from "../../lib/tools/utility.tools";

/**
 * Wires the entire AI core (LLM, embeddings, retriever, tools, memory, agent).
 * Exported globally so any feature module can inject the orchestrator/services.
 */
@Global()
@Module({
  providers: [
    GeminiService,
    EmbeddingsService,
    VectorRepository,
    Reranker,
    RetrieverService,
    MemoryService,
    // tools
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
    ToolRegistry,
    AgentOrchestrator,
  ],
  exports: [
    GeminiService,
    EmbeddingsService,
    VectorRepository,
    RetrieverService,
    MemoryService,
    AgentOrchestrator,
  ],
})
export class AgentModule {}
