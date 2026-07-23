import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ashish Pokhrel — AI Engineer & Full-Stack Architect',
  description: 'Agentic RAG AI Portfolio. Interactive intelligent assistant grounded in projects, skills, and work experience.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`dark ${sans.variable} ${mono.variable}`}>
      <body
        suppressHydrationWarning
        className="bg-ink text-slate-100 min-h-screen relative overflow-x-hidden"
      >
        {/* Background Ambient Glow Orbs */}
        <div className="pointer-events-none fixed left-1/2 top-0 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="pointer-events-none fixed right-0 top-1/4 -z-10 h-[400px] w-[400px] rounded-full bg-cyan-500/10 blur-[100px]" />
        <div className="pointer-events-none fixed left-0 bottom-10 -z-10 h-[450px] w-[450px] rounded-full bg-pink-500/10 blur-[110px]" />

        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
