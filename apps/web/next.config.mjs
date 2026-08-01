import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));

/** Vercel sets this on every build and at runtime. */
const ON_VERCEL = Boolean(process.env.VERCEL);

/**
 * Next.js only reads `.env` from its own directory, but this monorepo keeps a
 * single shared `.env` at the root. Load it explicitly so `pnpm dev` works
 * without duplicating configuration into `apps/web/.env`.
 *
 * `override: false` means a real environment variable (Docker, CI) always wins
 * over the file.
 *
 * Skipped on Vercel, where configuration comes from the project's environment
 * and a `.env` that ever escaped `.gitignore` would silently shadow it.
 */
if (!ON_VERCEL) {
  for (const envPath of [resolve(here, ".env"), resolve(here, "../../.env")]) {
    if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });
  }
}

/**
 * Where to proxy `/api/*`.
 *
 * In the Docker stack this is unset and unused: Caddy routes `/api/*` straight
 * to the API container, so the browser is already same-origin and Next never
 * sees those requests. The rewrite exists so `pnpm dev` works without running
 * a reverse proxy locally.
 *
 * On Vercel there is no API to proxy to — it is hosted elsewhere and the
 * browser calls it directly via `NEXT_PUBLIC_API_URL`. Defaulting to
 * `localhost:4000` there would install a rewrite pointing at the serverless
 * function's own loopback, turning every missed `/api/*` request into a
 * confusing timeout instead of an obvious 404.
 */
const API_URL =
  process.env.API_URL ?? (ON_VERCEL ? "" : "http://localhost:4000");

/**
 * On Vercel, `NEXT_PUBLIC_API_URL` is the only thing pointing the browser at
 * the API. Forget it and the build still succeeds: `API_BASE_URL` falls back
 * to `""`, every call goes same-origin to `/api/v1/...`, and Next answers its
 * own request with a 404. The symptom is a working site where signing in fails
 * with "Request failed with status 404" — which reads like a broken endpoint
 * rather than a missing environment variable.
 *
 * Failing the build instead costs a redeploy and saves that hunt.
 */
if (ON_VERCEL && !process.env.NEXT_PUBLIC_API_URL && !API_URL) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is not set.\n\n" +
      "The browser needs an absolute URL for the API — there is no backend " +
      "on this deployment to proxy to. Set it in the Vercel project's " +
      "Environment Variables to the API project's URL, e.g.\n" +
      "  NEXT_PUBLIC_API_URL=https://your-api.vercel.app\n\n" +
      "Then set APP_URL and CORS_ORIGINS on the API project to this app's " +
      "URL, or the browser will block the response.",
  );
}

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
   *
   * Docker only. Vercel builds its own output format and does not consume a
   * standalone server, so leaving this on there just produces a second copy of
   * the bundle that nothing serves.
   */
  output: ON_VERCEL ? undefined : "standalone",
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
    if (!API_URL) return [];

    return [
      {
        source: "/api/:path*",
        destination: `${API_URL.replace(/\/+$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
