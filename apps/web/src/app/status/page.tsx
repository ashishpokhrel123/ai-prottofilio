import type { Metadata } from "next";
import { StatusDashboard } from "@/features/status/StatusDashboard";

export const metadata: Metadata = {
  title: "System status — Ashish Pokhrel",
  description:
    "Live health of the database, language model and ingestion queue behind this portfolio.",
};

/**
 * The report is fetched in the browser, not here.
 *
 * Rendering it on the server would bake a snapshot into the response and let a
 * CDN cache it — a status page that shows a stale "all systems operational" is
 * actively worse than none. The client polls instead, so what you see is what
 * is true now.
 */
export default function StatusPage() {
  return <StatusDashboard />;
}
