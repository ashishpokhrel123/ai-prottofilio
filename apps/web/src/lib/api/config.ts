/**
 * Where the browser sends API requests.
 *
 * Empty by default, which means same-origin `/api/...` and lets the Next.js
 * rewrite proxy to the backend. That keeps the API origin out of the browser
 * bundle in development and avoids a CORS preflight on every chat token.
 *
 * Set `NEXT_PUBLIC_API_URL` to call a separately hosted API directly (the
 * frontend is on Vercel; the API is not).
 */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(
  /\/+$/,
  "",
);

export const API_PREFIX = "/api/v1";

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${API_PREFIX}${normalized}`;
}

/**
 * Skips the admin login screen during local development.
 *
 * The mirror of the API's `AUTH_DEV_BYPASS`, and useless without it — the
 * console would render but every request would still 401. Both halves have to
 * be switched on deliberately.
 *
 * The `NODE_ENV` check is the load-bearing part, and it is not the same
 * protection the API has. `next build` sets `NODE_ENV=production`, so this is
 * statically `false` in any production bundle and the branch is eliminated at
 * build time. A stray `NEXT_PUBLIC_AUTH_DEV_BYPASS=true` in a deploy
 * environment therefore cannot open the console — there is no code left to
 * open it.
 */
export const AUTH_DEV_BYPASS =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_AUTH_DEV_BYPASS === "true";

/**
 * Stand-in for a real JWT while the bypass is on.
 *
 * The API ignores the Authorization header entirely in this mode, so the value
 * is arbitrary — it is named to be unmistakable if it ever shows up in a log
 * or a bug report.
 */
export const DEV_BYPASS_TOKEN = "dev-bypass-no-auth";
