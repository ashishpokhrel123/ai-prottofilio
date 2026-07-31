/**
 * The slice of the tool registry the planner needs: check a name, describe the
 * available tools. Nothing more.
 *
 * Interface segregation with a concrete payoff — depending on the full
 * `ToolRegistry` would drag Prisma and all twelve tool implementations into
 * the planner's compilation unit, and therefore into its tests.
 */
export interface ToolCatalogue {
  has(name: string): boolean;
  /** Rendered tool list injected into the planner prompt. */
  catalogue(): string;
}

export const TOOL_CATALOGUE = Symbol("ToolCatalogue");
