import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Next.js only reads `.env` from its own directory, but this monorepo keeps a
 * single shared `.env` at the root. Load it explicitly so `pnpm dev` works
 * without duplicating configuration into `apps/web/.env`.
 *
 * `override: false` means a real environment variable (Docker, CI) always wins
 * over the file.
 */
for (const envPath of [resolve(here, ".env"), resolve(here, "../../.env")]) {
  if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });
}

/**
 * Where to proxy `/api/*` during development.
 *
 * In the Docker stack this is unset and unused: Caddy routes `/api/*` straight
 * to the API container, so the browser is already same-origin and Next never
 * sees those requests. The rewrite exists purely so `pnpm dev` works without
 * running a reverse proxy locally.
 */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** Applied to every response. Caddy adds transport-level headers on top. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Microphone stays enabled for the voice-input feature.
    value: "camera=(), geolocation=(), interest-cohort=(), microphone=(self)",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@ai-portfolio/shared"],

  /**
   * Emits a self-contained server bundle with only the modules actually
   * imported. Turns a ~1GB image (which would need the whole pnpm workspace)
   * into roughly 150MB. `outputFileTracingRoot` is required in a monorepo so
   * tracing follows symlinks out of `apps/web` into the workspace root.
   */
  output: "standalone",
  outputFileTracingRoot: resolve(here, "../../"),

  // Fail the build on a type or lint error rather than shipping a broken
  // image. Both default to blocking; stated explicitly so nobody "fixes" a
  // red build by switching them off.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL.replace(/\/+$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
