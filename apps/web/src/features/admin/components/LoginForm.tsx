"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<boolean>;
  isSubmitting: boolean;
  error: string | null;
}

const INPUT_CLASSES =
  "peer w-full  border border-panel-line bg-panel py-3 pl-11 pr-4 text-sm text-zinc-100 " +
  "placeholder:text-zinc-500 transition duration-200 " +
  "hover:border-panel-line " +
  "focus:border-signal/50 focus:bg-panel focus:outline-none focus:ring-2 focus:ring-signal/30";

const ICON_CLASSES =
  "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 " +
  "transition-colors duration-200 peer-focus:text-signal";

export function LoginForm({ onSubmit, isSubmitting, error }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // A real form element, so Enter submits and password managers can autofill —
  // neither worked when this was a pair of loose inputs with a click handler.
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(email, password);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      {/* Light/dark switch, pinned to the top-right corner of the page. */}
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      {/* Localised glow behind the card. Purely decorative, so it is hidden
          from assistive tech and sits under the content in the stacking order. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/10 blur-[100px]"
      />

      <div className="relative w-full max-w-sm animate-fade-up">
        <Link
          href="/"
          className="group mb-8 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ArrowLeft
            size={13}
            className="transition-transform duration-200 group-hover:-translate-x-0.5"
          />
          Back to portfolio
        </Link>

        <div className="mb-8 space-y-3 text-center">
          <div className="relative mx-auto h-14 w-14">
            <div
              aria-hidden="true"
              className="absolute inset-0 from-signal to-signal opacity-20 blur-md"
            />
            <div className="relative flex h-14 w-14 items-center justify-center border border-panel-line from-signal/20 to-signal/10 text-signal">
              <Sparkles size={24} aria-hidden="true" />
            </div>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Admin Console
            </h1>
            <p className="text-sm text-zinc-400">
              Sign in to manage the knowledge base
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="panel space-y-4 p-6 shadow-overlay"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-xs font-medium text-zinc-400"
            >
              Email address
            </label>
            <div className="relative">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={INPUT_CLASSES}
              />
              <Mail size={16} className={ICON_CLASSES} aria-hidden="true" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-zinc-400"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${INPUT_CLASSES} pr-11`}
              />
              <Lock size={16} className={ICON_CLASSES} aria-hidden="true" />

              {/* `tabIndex={-1}` keeps Tab going straight from the password
                  field to Sign in. Reaching a visibility toggle on the way to
                  submitting is a small thing that feels wrong every time. */}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-500 transition-colors hover:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-signal/30"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="animate-fade-up border border-status-error/25 bg-status-error/10 px-3.5 py-2.5 text-xs leading-relaxed text-status-error"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden from-signal to-signal py-3 text-sm font-semibold text-white shadow-raised transition-all duration-200 hover:shadow-raised focus:outline-none focus:ring-2 focus:ring-signal/40 focus:ring-offset-2 focus:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
          >
            {isSubmitting && (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            )}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-600">
          Protected area. Credentials are created by the database seed.
        </p>
      </div>
    </main>
  );
}
