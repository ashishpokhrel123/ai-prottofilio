import { z } from "zod";
import { parseJsonResponse } from "./parse-json";

const schema = z.object({
  intent: z.string(),
  needsRetrieval: z.boolean().default(true),
});

const fallback = { intent: "other", needsRetrieval: true };

describe("parseJsonResponse", () => {
  it("parses a bare JSON object", () => {
    expect(
      parseJsonResponse(
        '{"intent":"skills","needsRetrieval":false}',
        schema,
        fallback,
      ),
    ).toEqual({ intent: "skills", needsRetrieval: false });
  });

  it("extracts JSON from a fenced code block", () => {
    const raw =
      'Here you go:\n```json\n{"intent":"projects"}\n```\nHope that helps!';

    expect(parseJsonResponse(raw, schema, fallback)).toEqual({
      intent: "projects",
      needsRetrieval: true,
    });
  });

  it("handles braces inside string values", () => {
    const raw = '{"intent":"other","needsRetrieval":true}';
    expect(parseJsonResponse(raw, schema, fallback).intent).toBe("other");
  });

  it("finds the balanced object even with a trailing brace in prose", () => {
    const raw = 'Result: {"intent":"github"} — note the } character.';
    expect(parseJsonResponse(raw, schema, fallback).intent).toBe("github");
  });

  it.each([
    ["no JSON at all", "I'm not sure how to answer that."],
    ["truncated JSON", '{"intent":"skills"'],
    ["invalid syntax", "{intent: skills}"],
    ["an array", '["skills"]'],
    ["an empty string", ""],
  ])("falls back on %s", (_label, raw) => {
    expect(parseJsonResponse(raw, schema, fallback)).toBe(fallback);
  });

  it("falls back when the JSON is valid but the schema fails", () => {
    // Structurally fine, semantically wrong — the exact failure an `as T`
    // cast would have let through.
    expect(parseJsonResponse('{"intent":42}', schema, fallback)).toBe(fallback);
  });
});
