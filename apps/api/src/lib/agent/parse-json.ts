import { z } from "zod";

/**
 * Extracts and validates a JSON object from an LLM response.
 *
 * Models wrap JSON in prose or fenced code blocks no matter how firmly the
 * prompt forbids it, so we locate the outermost braces first. The result is
 * then parsed through a Zod schema — an LLM producing structurally valid but
 * semantically wrong JSON is a routine failure mode, and an unvalidated
 * `as T` cast would let it propagate as a type lie.
 *
 * Returns `fallback` on any failure; callers always have a deterministic path.
 */
export function parseJsonResponse<S extends z.ZodTypeAny>(
  raw: string,
  schema: S,
  fallback: z.infer<S>,
): z.infer<S> {
  const candidate = extractJsonObject(raw);
  if (!candidate) return fallback;

  try {
    const result = schema.safeParse(JSON.parse(candidate));
    return result.success ? (result.data as z.infer<S>) : fallback;
  } catch {
    return fallback;
  }
}

/** Finds the first balanced `{...}` span, ignoring braces inside strings. */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const char = raw[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }

  return null;
}
