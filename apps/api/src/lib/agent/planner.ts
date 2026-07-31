import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { errorMessage } from "../../core/errors/domain.errors";
import { LLM_PORT, type LlmPort } from "../../core/ports";
import { PLANNER_SYSTEM } from "../prompts/system.prompts";
import { parseJsonResponse } from "./parse-json";
import { TOOL_CATALOGUE, type ToolCatalogue } from "./tool-catalogue";
import type { Intent, IntentName, Plan } from "./agent.types";

const MAX_PLAN_STEPS = 4;

const planResponseSchema = z.object({
  steps: z
    .array(z.object({ tool: z.string(), input: z.string().default("") }))
    .min(1),
  reason: z.string().default("llm plan"),
});

/**
 * Deterministic tool chains for intents whose answer shape is already known.
 *
 * Every entry here is one fewer model call on the hot path: lower latency,
 * lower cost, and — because the chain can't be hallucinated — more predictable
 * answers. The LLM planner only handles the genuinely open-ended remainder.
 */
const FAST_PLANS: Partial<
  Record<IntentName, { reason: string; tools: string[] }>
> = {
  job_fit: {
    reason: "job-fit chain",
    tools: [
      "job_description_analyzer",
      "resume_tool",
      "skills_tool",
      "project_search",
    ],
  },
  projects: {
    reason: "project lookup",
    tools: ["project_search", "knowledge_search"],
  },
  project_detail: {
    reason: "project lookup",
    tools: ["project_search", "knowledge_search"],
  },
  skills: { reason: "skills lookup", tools: ["skills_tool"] },
  experience: { reason: "experience lookup", tools: ["experience_tool"] },
  education: { reason: "education lookup", tools: ["knowledge_search"] },
  certificates: { reason: "certificate lookup", tools: ["document_search"] },
  contact: { reason: "contact details", tools: ["contact_tool"] },
  github: { reason: "github repos", tools: ["github_tool"] },
  resume_download: { reason: "resume", tools: ["resume_tool"] },
  about: {
    reason: "profile overview",
    tools: ["resume_tool", "knowledge_search"],
  },
};

/**
 * Pipeline node 2 — decide which tools to run, and in what order.
 */
@Injectable()
export class Planner {
  private readonly logger = new Logger(Planner.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    @Inject(TOOL_CATALOGUE) private readonly tools: ToolCatalogue,
  ) {}

  async plan(intent: Intent, signal?: AbortSignal): Promise<Plan> {
    const fast = FAST_PLANS[intent.intent];
    if (fast) {
      return {
        reason: fast.reason,
        steps: fast.tools.map((tool) => ({
          tool,
          input: intent.resolvedQuery,
        })),
      };
    }

    const fallback: Plan = {
      reason: "generic retrieval fallback",
      steps: [{ tool: "knowledge_search", input: intent.resolvedQuery }],
    };

    try {
      const raw = await this.llm.complete(
        PLANNER_SYSTEM,
        [
          {
            role: "user",
            content:
              `Intent: ${intent.intent}\n` +
              `Question: ${intent.resolvedQuery}\n` +
              `Tools:\n${this.tools.catalogue()}`,
          },
        ],
        { signal, temperature: 0 },
      );

      const parsed = parseJsonResponse(raw, planResponseSchema, {
        steps: [...fallback.steps],
        reason: fallback.reason,
      });

      // Drop hallucinated tool names before they reach the executor.
      const steps = parsed.steps
        .filter((step) => {
          const known = this.tools.has(step.tool);
          if (!known) {
            this.logger.debug(`Planner proposed unknown tool "${step.tool}"`);
          }
          return known;
        })
        .slice(0, MAX_PLAN_STEPS)
        .map((step) => ({
          tool: step.tool,
          input: step.input || intent.resolvedQuery,
        }));

      return steps.length > 0 ? { steps, reason: parsed.reason } : fallback;
    } catch (err) {
      this.logger.warn(`Planning failed, using fallback: ${errorMessage(err)}`);
      return fallback;
    }
  }
}
