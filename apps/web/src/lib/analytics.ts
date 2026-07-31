import { apiUrl } from "./api/config";
import { getVisitorId } from "./chat-client";

/** Mirrors the server's allow-list; anything else is rejected with a 400. */
export type AnalyticsEventType =
  "visit" | "question" | "project_view" | "skill_query" | "download_resume";

const VISIT_MARKER_KEY = "ap_visit_tracked";

/**
 * Records an anonymous event.
 *
 * Deliberately fire-and-forget and never throws: analytics is observability,
 * and a blocked request (ad blockers routinely eat anything named "analytics")
 * must not surface as an error in the UI.
 */
export function trackEvent(
  type: AnalyticsEventType,
  payload?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    type,
    visitorId: getVisitorId() || undefined,
    payload,
  });

  // `keepalive` so the request still completes if the visitor navigates away
  // in the same tick — the common case for a bounce, which is exactly the
  // visit worth counting.
  void fetch(apiUrl("/analytics/event"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Records one `visit` per browser session.
 *
 * `sessionStorage` rather than `localStorage`: a return visit tomorrow is a
 * new visit, but a route change or a React strict-mode double-mount is not.
 */
export function trackVisitOnce(): void {
  if (typeof window === "undefined") return;

  try {
    if (window.sessionStorage.getItem(VISIT_MARKER_KEY)) return;
    window.sessionStorage.setItem(VISIT_MARKER_KEY, "1");
  } catch {
    // Private browsing can throw on write. Counting the visit twice is a
    // better failure than not counting it at all.
  }

  trackEvent("visit", { referrer: document.referrer || undefined });
}
