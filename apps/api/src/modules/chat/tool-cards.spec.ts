import { analyticsEventForTool, toToolCard } from "./tool-cards";

const projectRow = {
  id: "p1",
  slug: "immortalis",
  name: "Immortalis",
  summary: "A thing that does things.",
  technologies: ["Rust", "NestJS"],
  githubUrl: "https://github.com/example/immortalis",
  liveUrl: null,
  featured: true,
  // Columns the UI never renders. Present here precisely because the point of
  // this module is that they must not survive the projection.
  description: "A much longer internal description.",
  order: 3,
  createdAt: new Date("2026-01-01"),
};

describe("toToolCard", () => {
  describe("project_search", () => {
    it("projects rows down to the declared card fields", () => {
      const card = toToolCard("project_search", [projectRow]);

      expect(card).toEqual({
        tool: "project_search",
        data: [
          {
            id: "p1",
            slug: "immortalis",
            name: "Immortalis",
            summary: "A thing that does things.",
            technologies: ["Rust", "NestJS"],
            githubUrl: "https://github.com/example/immortalis",
            liveUrl: null,
            featured: true,
          },
        ],
      });
    });

    it("drops columns that are not part of the card schema", () => {
      const card = toToolCard("project_search", [projectRow]);
      const [project] = card?.data as Record<string, unknown>[];

      expect(project).not.toHaveProperty("description");
      expect(project).not.toHaveProperty("order");
      expect(project).not.toHaveProperty("createdAt");
    });

    it("returns undefined for an empty result rather than an empty card", () => {
      expect(toToolCard("project_search", [])).toBeUndefined();
    });

    it("returns undefined when a row is missing a required field", () => {
      expect(toToolCard("project_search", [{ id: "p1" }])).toBeUndefined();
    });

    it("returns undefined when the payload is not an array", () => {
      expect(toToolCard("project_search", { id: "p1" })).toBeUndefined();
    });
  });

  describe("skills_tool", () => {
    it("passes through valid grouped skills", () => {
      const data = {
        Backend: [{ name: "NestJS", level: 5 }],
        Frontend: [{ name: "React", level: 4 }],
      };

      expect(toToolCard("skills_tool", data)).toEqual({
        tool: "skills_tool",
        data,
      });
    });

    it("rejects the legacy string[] shape", () => {
      // The tool used to return pre-rendered strings ("NestJS (5/5)"). Anything
      // still emitting that shape must lose its card, not crash the browser.
      expect(
        toToolCard("skills_tool", { Backend: ["NestJS (5/5)"] }),
      ).toBeUndefined();
    });

    it("returns undefined when no categories are present", () => {
      expect(toToolCard("skills_tool", {})).toBeUndefined();
    });
  });

  it("returns undefined for tools with no card representation", () => {
    expect(toToolCard("calculator", { result: 42 })).toBeUndefined();
    expect(toToolCard("contact_tool", { email: "a@b.c" })).toBeUndefined();
  });

  it("returns undefined for absent data", () => {
    expect(toToolCard("project_search", undefined)).toBeUndefined();
    expect(toToolCard("project_search", null)).toBeUndefined();
  });
});

describe("analyticsEventForTool", () => {
  it("attributes project and skill events to the tools that serve them", () => {
    expect(analyticsEventForTool("project_search")).toBe("project_view");
    expect(analyticsEventForTool("skills_tool")).toBe("skill_query");
  });

  it("returns undefined for tools with no analytics meaning", () => {
    expect(analyticsEventForTool("calculator")).toBeUndefined();
    expect(analyticsEventForTool("current_time")).toBeUndefined();
  });

  it("does not resolve inherited object properties as events", () => {
    // `TOOL_EVENTS` is an object literal, so a tool literally named
    // "constructor" or "toString" would otherwise return a function.
    expect(analyticsEventForTool("constructor")).toBeUndefined();
    expect(analyticsEventForTool("toString")).toBeUndefined();
  });
});
