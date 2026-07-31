import {
  CARD_TOOLS,
  projectCardsSchema,
  skillGroupsSchema,
  type ProjectCard,
  type SkillGroups,
} from "@ai-portfolio/shared";
import type { AnalyticsEventType } from "../analytics/analytics.service";

/**
 * The allow-list between the agent and the browser.
 *
 * Tools return whatever shape suits them, and most of that is context for the
 * model rather than something a visitor should receive. Rather than streaming
 * `data` verbatim, every payload is re-projected here into the narrow schema
 * the UI declares. A new column on `Project` therefore cannot reach the client
 * by accident — it has to be added to `projectCardSchema` first.
 */

export interface ToolCard {
  readonly tool: string;
  readonly data: ProjectCard[] | SkillGroups;
}

/**
 * Analytics events attributable to a tool the agent chose to run.
 *
 * A `Map` rather than an object literal: tool names come from the planner LLM,
 * and an object lookup for "constructor" or "toString" resolves up the
 * prototype chain to a function, which would then be written to the events
 * table as an event type.
 */
const TOOL_EVENTS = new Map<string, AnalyticsEventType>([
  [CARD_TOOLS.PROJECT_SEARCH, "project_view"],
  [CARD_TOOLS.SKILLS, "skill_query"],
]);

export function analyticsEventForTool(
  tool: string,
): AnalyticsEventType | undefined {
  return TOOL_EVENTS.get(tool);
}

/**
 * Narrows a tool's raw output to its card payload.
 *
 * Returns `undefined` for tools with no card, for missing data, and for data
 * that fails validation — a malformed payload should cost the visitor a card,
 * never the answer.
 */
export function toToolCard(tool: string, data: unknown): ToolCard | undefined {
  if (data === undefined || data === null) return undefined;

  switch (tool) {
    case CARD_TOOLS.PROJECT_SEARCH: {
      const parsed = projectCardsSchema.safeParse(toProjectCards(data));
      return parsed.success && parsed.data.length > 0
        ? { tool, data: parsed.data }
        : undefined;
    }

    case CARD_TOOLS.SKILLS: {
      const parsed = skillGroupsSchema.safeParse(data);
      return parsed.success && Object.keys(parsed.data).length > 0
        ? { tool, data: parsed.data }
        : undefined;
    }

    default:
      return undefined;
  }
}

/** Projects Prisma rows down to the fields `projectCardSchema` declares. */
function toProjectCards(data: unknown): unknown {
  if (!Array.isArray(data)) return data;

  return data.map((row: Record<string, unknown>) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    technologies: row.technologies,
    githubUrl: row.githubUrl ?? null,
    liveUrl: row.liveUrl ?? null,
    featured: row.featured ?? false,
  }));
}
