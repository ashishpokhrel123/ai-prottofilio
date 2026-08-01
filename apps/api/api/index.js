/**
 * Vercel Function entrypoint.
 *
 * Deliberately JavaScript, and deliberately thin. Vercel compiles files under
 * `api/` with esbuild, which does not emit `design:paramtypes` metadata — Nest
 * resolves constructor dependencies from that metadata, so a `.ts` entrypoint
 * here would build fine and then fail at runtime with "Nest can't resolve
 * dependencies". Compiling with tsc via `nest build` and requiring the output
 * keeps the decorator metadata intact.
 *
 * `buildCommand` in vercel.json runs before functions are bundled, so `dist/`
 * exists by the time this file is traced.
 */
module.exports = require("../dist/src/serverless").default;
