import { Injectable, Logger } from "@nestjs/common";
import type { Citation } from "@ai-portfolio/shared";
import { withTimeout } from "../../common/utils/with-timeout";
import { errorMessage } from "../../core/errors/domain.errors";
import { ToolRegistry } from "../tools/tool.registry";
import type { AgentEvent, Plan, ToolOutcome } from "./agent.types";

/** Guards against a single wedged tool stalling the whole response. */
const TOOL_TIMEOUT_MS = 20_000;

export interface ExecutionResult {
  readonly outcomes: readonly ToolOutcome[];
  readonly citations: readonly Citation[];
}

/**
 * Pipeline node 3 — run the planned tools, streaming lifecycle events so the
 * UI can show what the agent is doing.
 *
 * Failure of one tool is isolated: the vector store being down should degrade
 * the answer, not replace it with an error page.
 */
@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);

  constructor(private readonly registry: ToolRegistry) {}

  async *execute(
    plan: Plan,
    context: { query: string; conversationId: string },
  ): AsyncGenerator<AgentEvent, ExecutionResult> {
    const outcomes: ToolOutcome[] = [];
    const citations: Citation[] = [];

    for (const step of plan.steps) {
      const tool = this.registry.get(step.tool);
      if (!tool) continue;

      yield { type: "tool_start", tool: step.tool };

      // Captured so `tool_end` can carry it to the transport. Stays undefined
      // for tools that only produce prose, and for failures.
      let structured: unknown;

      try {
        const output = await withTimeout(
          tool.run(step.input || context.query, context),
          TOOL_TIMEOUT_MS,
          `tool "${step.tool}"`,
        );

        if (output.citations?.length) citations.push(...output.citations);
        if (output.ok) structured = output.data;

        // `ok: false` means the tool ran fine but found nothing. Its message
        // ("GitHub has not been synced yet.") is a status line, not knowledge:
        // marking it failed keeps it out of the synthesis context and out of
        // the confidence gate, instead of being fed to the model as if it
        // were retrieved content.
        outcomes.push({
          tool: step.tool,
          text: output.text,
          data: output.data,
          failed: !output.ok,
          emptyReason: output.emptyReason,
        });
      } catch (err) {
        this.logger.warn(
          `Tool "${step.tool}" failed, continuing without it: ${errorMessage(err)}`,
        );
        outcomes.push({ tool: step.tool, text: "", failed: true });
      }

      yield { type: "tool_end", tool: step.tool, data: structured };
    }

    return { outcomes, citations };
  }
}
