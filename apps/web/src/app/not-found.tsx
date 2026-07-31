import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
        <Compass size={26} aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-white">Page not found</h1>
        <p className="text-sm text-slate-400">
          That page doesn&apos;t exist — but the assistant on the home page can
          probably answer whatever brought you here.
        </p>
      </div>

      <Link
        href="/"
        className="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2.5 text-sm font-medium text-white shadow-glow transition hover:opacity-95"
      >
        Back to the portfolio
      </Link>
    </main>
  );
}
