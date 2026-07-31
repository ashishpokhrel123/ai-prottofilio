import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ashish Pokhrel — Software Engineer",
  description:
    "Agentic RAG AI Portfolio. Interactive intelligent assistant grounded in projects, skills, and work experience.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${sans.variable} ${mono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="bg-ink text-slate-100 min-h-screen relative overflow-x-hidden"
      >
        {/* ── Animated Background Layers ── */}

        {/* Mesh gradient — slowly morphing ambient light */}
        <div className="bg-mesh" aria-hidden="true" />

        {/* Noise texture — subtle analog grain */}
        <div className="bg-noise" aria-hidden="true" />

        {/* Dot grid — spatial depth */}
        <div className="bg-dots" aria-hidden="true" />

        {/* Floating Aurora Orbs — animated drift & glow */}
        <div
          className="pointer-events-none fixed left-1/2 top-0 -z-10 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-600/[0.12] blur-[140px] animate-aurora-drift"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none fixed right-0 top-1/4 -z-10 h-[450px] w-[450px] rounded-full bg-cyan-500/[0.10] blur-[120px] animate-aurora-drift-alt"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none fixed left-0 bottom-10 -z-10 h-[500px] w-[500px] rounded-full bg-pink-500/[0.08] blur-[130px] animate-float-slow"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none fixed right-1/4 bottom-1/3 -z-10 h-[350px] w-[350px] rounded-full bg-violet-500/[0.06] blur-[100px] animate-float-delayed"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none fixed left-1/3 top-1/2 -z-10 h-[300px] w-[300px] rounded-full bg-emerald-500/[0.04] blur-[90px] animate-float"
          aria-hidden="true"
        />

        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
