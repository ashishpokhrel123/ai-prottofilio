import type { Metadata } from "next";
import { Google_Sans_Code } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/**
 * Google Sans Flex + Google Sans Code — the Gemini type system.
 *
 * Google Sans was proprietary for a decade; Google Sans Flex is the 2025
 * open-source rebuild of it (SIL OFL, David Berlow), and it is what Gemini's
 * own surfaces are set in. Using it means the page stops *evoking* the Gemini
 * design language and is actually built from it.
 *
 * ── Why the <link> and not next/font ─────────────────────────────────────
 * Google Sans Flex is on Google Fonts but is not yet in next@15.5's bundled
 * font manifest (`Google Sans Code` is; `Google Sans Flex` is not), so
 * `next/font/google` cannot resolve it — the import fails at build. Until the
 * manifest catches up it is loaded with a plain stylesheet link below.
 *
 * The cost is real and worth stating: no self-hosting, so there is a DNS +
 * TLS round trip to fonts.googleapis.com and another to fonts.gstatic.com on
 * first paint, and no automatic `size-adjust` fallback, so there is some CLS
 * exposure. `preconnect` on both origins and `display=swap` blunt it. To
 * remove it entirely, download the woff2 into `src/fonts` and switch to
 * `next/font/local` — that is a drop-in change to this file alone.
 *
 * Mono still goes through next/font because it can: Google Sans Code is the
 * companion monospace, so the metadata labels and code blocks come from the
 * same family as everything else instead of importing a fourth voice.
 */
const mono = Google_Sans_Code({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/**
 * Two cuts of one variable family, pinned to different axis settings.
 *
 * Google Sans Flex carries `wght`, `wdth`, `opsz`, `slnt` and `ROND`. Asking
 * for the full range of every axis is a large download, so this requests the
 * two ranges actually used: weight 300–800 at normal width for UI, and the
 * same for display — the display/UI distinction is drawn with `wdth` and
 * tracking in CSS rather than by loading a second family.
 */
const GOOGLE_SANS_FLEX_HREF =
  "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wdth,wght@6..144,75..125,300..800&display=swap";

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
    <html lang="en" suppressHydrationWarning className={mono.variable}>
      <head>
        {/* Both origins, both needed: the CSS comes from googleapis, the woff2
            itself from gstatic. Warming only the first still leaves a full
            handshake in front of the font file. `crossOrigin` is required on
            the gstatic hint — font fetches are CORS requests, and a preconnect
            without it opens a connection the font can't reuse. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link rel="stylesheet" href={GOOGLE_SANS_FLEX_HREF} />

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
