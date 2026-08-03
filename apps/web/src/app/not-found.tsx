import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div className="flex items-center gap-2.5">
        <span className="label-meta">404</span>
        <span className="rule flex-1" />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-medium tracking-tight text-zinc-100">
          Page not found
        </h1>
        <p className="text-sm leading-relaxed text-zinc-500">
          That page doesn&apos;t exist — but the assistant on the home page can
          probably answer whatever brought you here.
        </p>
      </div>

      <Link
        href="/"
        className="w-fit bg-signal px-4 py-2 text-sm font-medium text-panel transition-colors hover:bg-signal/90"
      >
        Back to the portfolio
      </Link>
    </main>
  );
}
