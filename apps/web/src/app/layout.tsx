import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/**
 * Roboto + Roboto Mono, matching the Gemini design language.
 *
 * Google Sans is proprietary and not in the Google Fonts catalog, so Roboto —
 * the guide's own body-text fallback, from the same design family — carries
 * UI and body copy, and Roboto Mono carries every metric and label.
 * `--font-display` aliases `--font-sans` in globals.css, so the `font-display`
 * utility (hero headline, brand mark) renders as the same family at heavier
 * weights rather than pulling a second typeface.
 */
const sans = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ashish Pokhrel — Software Engineer",
  description:
    "An agentic RAG assistant answering from real projects, skills and work history — with the retrieval pipeline shown in the open.",
  icons: { icon: "/favicon.ico" },
};

const themeInitScript = `
try {
  var stored = localStorage.getItem("theme");
  var dark = stored
    ? stored === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/* Sets `.dark` before first paint so the page never flashes light for
            dark-mode visitors, then React hydration confirms the class. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        suppressHydrationWarning
        className="relative min-h-screen overflow-x-hidden bg-panel text-zinc-200 selection:bg-signal/30 selection:text-zinc-100"
      >
        {/*
          One static gradient, replacing five fixed blurred orbs.

          Those orbs were 300–900px wide at 90–140px blur, animated on infinite
          loops. A blur that size is one of the most expensive things a browser
          can paint, and repainting five of them every frame cost real battery
          on every device that visited. This is a single non-animated
          background-image — a blue-to-pink brand wash, per the theme.
        */}
        <div className="bg-grid" aria-hidden="true" />

        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
