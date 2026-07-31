import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

/**
 * Loads `.env` files for local development, then validates the result.
 *
 * In a real deployment (Railway, Render, Fly, Docker, CI) the environment is
 * injected by the platform and no `.env` file exists — that is the expected
 * path and this function is a no-op beyond validation. The dotenv lookup only
 * exists so `pnpm dev` works from a monorepo root `.env`.
 *
 * Must be the first import of any entrypoint (`main.ts`, worker, seed).
 */
export function loadEnvFiles(): void {
  // Nearest-first: an app-local .env wins over the shared root one.
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;

    warnOnDuplicateKeys(path);
    loadDotenv({ path, override: false });
  }
}

/**
 * Warns when a key is assigned more than once in the same file.
 *
 * dotenv silently keeps the *last* assignment, so a stray second
 * `JWT_SECRET=` further down the file overrides the real one with no
 * indication — the resulting failure points at a value you can see is
 * correct on the line you're looking at.
 */
function warnOnDuplicateKeys(path: string): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!match) continue;

    const key = match[1];
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }

  if (duplicates.size === 0) return;

  // Runs before the logger exists, so this is deliberately console-based.
  // eslint-disable-next-line no-console
  console.warn(
    `[env] ${path} assigns these keys more than once: ${[...duplicates].join(", ")}. ` +
      "The last assignment wins — remove the earlier ones.",
  );
}
