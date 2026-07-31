"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { trackVisitOnce } from "@/lib/analytics";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());

  // Recorded here rather than in a page component so every entry point counts,
  // and once per session rather than per mount. Without this the admin
  // dashboard's visitor count stays at zero no matter how much traffic
  // arrives — `POST /analytics/event` existed with nothing calling it.
  useEffect(() => {
    trackVisitOnce();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
