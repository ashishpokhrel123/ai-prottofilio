import type { Config } from "tailwindcss";

/**
 * Gemini design tokens.
 *
 * A re-theme of the terracotta/sand template around the Gemini design
 * language: an obsidian-gray panel system (`#131314` dark, `#FFFFFF` light)
 * lit by a blue → violet → pink brand gradient (Electric Blue `#078EFA`/
 * `#4285F4`, Soft Purple `#AD89EB`, Gemini Pink `#FDADEE`), with Roboto
 * standing in for Google Sans.
 *
 * Every colour is a CSS variable defined in globals.css under `:root` (light)
 * and `.dark`, consumed here via `rgb(var(--x) / <alpha-value>)` so opacity
 * modifiers like `bg-signal/30` compose correctly. Overriding `zinc` directly
 * means every existing `text-zinc-400` / `border-zinc-700` in the app
 * retints automatically — no per-component find-and-replace needed.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /** The canvas and its surfaces — deep obsidian in dark, pure white in
            light. `raised`/`hover`/`sunken` are the elevation ladder. */
        panel: {
          DEFAULT: "rgb(var(--panel) / <alpha-value>)",
          base: "rgb(var(--panel) / <alpha-value>)",
          /** Cards and raised surfaces. */
          raised: "rgb(var(--panel-raised) / <alpha-value>)",
          /** Hover lift, one step brighter than `raised`. */
          hover: "rgb(var(--panel-hover) / <alpha-value>)",
          /** Inputs and wells — recessed relative to `raised`. */
          sunken: "rgb(var(--panel-sunken) / <alpha-value>)",
          /**
           * Hairline rules, defined as channels so opacity modifiers compose
           * correctly instead of stomping the alpha channel.
           */
          line: "rgb(var(--panel-line) / <alpha-value>)",
          "line-strong": "rgb(var(--panel-line-strong) / <alpha-value>)",
        },
        /**
         * The functional accent — Electric Blue. Reserved for live/measured
         * values: streaming carets, active stages, confidence bars, the ready
         * indicator, primary actions.
         */
        signal: {
          DEFAULT: "rgb(var(--signal) / <alpha-value>)",
          dim: "rgb(var(--signal-dim) / <alpha-value>)",
          muted: "rgb(var(--signal-muted) / <alpha-value>)",
        },
        /** Non-signal status, blue-adjacent for the same neutral family. */
        status: {
          warn: "rgb(var(--status-warn) / <alpha-value>)",
          error: "rgb(var(--status-error) / <alpha-value>)",
        },
        /**
         * The brand gradient — blue → purple → pink, defined as a scale so
         * `from-gemini-400 to-gemini-600` reads as the Gemini sweep. Darkened
         * per theme so gradient text and buttons hold contrast on either
         * canvas.
         */
        gemini: {
          300: "rgb(var(--gemini-300) / <alpha-value>)",
          400: "rgb(var(--gemini-400) / <alpha-value>)",
          500: "rgb(var(--gemini-500) / <alpha-value>)",
          600: "rgb(var(--gemini-600) / <alpha-value>)",
          700: "rgb(var(--gemini-700) / <alpha-value>)",
        },
        /**
         * Neutral scale, standing in for Tailwind's default `zinc`.
         * 100 is the primary text colour in either theme (#E3E3E3 dark,
         * #1F1F1F light); the stops below it are the muted/structural greys.
         */
        zinc: {
          50: "rgb(var(--zinc-50) / <alpha-value>)",
          100: "rgb(var(--zinc-100) / <alpha-value>)",
          200: "rgb(var(--zinc-200) / <alpha-value>)",
          300: "rgb(var(--zinc-300) / <alpha-value>)",
          400: "rgb(var(--zinc-400) / <alpha-value>)",
          500: "rgb(var(--zinc-500) / <alpha-value>)",
          600: "rgb(var(--zinc-600) / <alpha-value>)",
          700: "rgb(var(--zinc-700) / <alpha-value>)",
          800: "rgb(var(--zinc-800) / <alpha-value>)",
          900: "rgb(var(--zinc-900) / <alpha-value>)",
          950: "rgb(var(--zinc-950) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Roboto", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "Roboto Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        /** The metadata scale — stage labels, counters, units. */
        meta: ["10px", { lineHeight: "14px", letterSpacing: "0.06em" }],
        micro: ["11px", { lineHeight: "16px", letterSpacing: "0.02em" }],
      },
      boxShadow: {
        /**
         * Real elevation instead of backdrop-blur. Blur is expensive to paint
         * and reads as a sticker layered over the page; a shadow reads as the
         * surface actually sitting above it. Values are theme-keyed via
         * globals.css so light mode gets a softer drop than dark.
         */
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
        /** Electric-blue outer glow — reserved for the hero input and CTA. */
        glow: "0 0 0 1px rgba(66,133,244,0.18), 0 4px 24px -4px rgba(66,133,244,0.28), 0 16px 48px -16px rgba(66,133,244,0.35)",
        "glow-sm": "0 0 16px -4px rgba(66,133,244,0.35)",
        "glow-strong":
          "0 0 0 1px rgba(66,133,244,0.4), 0 6px 32px -6px rgba(66,133,244,0.55), 0 24px 64px -20px rgba(66,133,244,0.5)",
      },
      animation: {
        "fade-up": "fadeUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in": "fadeIn 0.25s ease-out forwards",
        caret: "caret 1.05s ease-in-out infinite",
        /** Indeterminate progress for a stage that is still running. */
        "scan-line": "scanLine 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        /** Attention without motion sickness: opacity only, no transform. */
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "bar-fill": "barFill 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        /** A slow breathing glow for the hero light / status dot. */
        "glow-pulse": "glowPulse 3.2s ease-in-out infinite",
        /** Gradient drift for the gemini headline gradient. */
        "gradient-pan": "gradientPan 8s ease-in-out infinite",
        /** Status dot halo ping. */
        "ping-soft": "pingSoft 2.4s cubic-bezier(0, 0, 0.2, 1) infinite",
        /** Slow drift for a floating decorative element. */
        float: "float 9s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        caret: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.15" },
        },
        scanLine: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        barFill: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        glowPulse: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        gradientPan: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        pingSoft: {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "75%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
