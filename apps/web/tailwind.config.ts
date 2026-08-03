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
      /**
       * Google Sans Flex for everything, Google Sans Code for metadata.
       *
       * `sans` and `display` are the same family at different axis settings
       * (see `.font-display` in globals.css) — the fallbacks differ only in
       * that `display` degrades to the system UI font, which is the closest
       * geometric-humanist thing most machines have.
       */
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Google Sans Flex",
          "Google Sans",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: [
          "var(--font-display)",
          "Google Sans Flex",
          "Google Sans",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "Google Sans Code",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      /**
       * One type scale, with tracking and leading baked into every step.
       *
       * Tracking is a function of size, not taste: the same optical spacing
       * that makes an 84px headline feel set solid makes a 10px label
       * illegible. Binding the two together means a size can't be used
       * without the letterspacing it needs — which is what went wrong when
       * the page was built from ad-hoc `text-[34px] tracking-tight` pairs.
       *
       * The two display steps are fluid: `clamp()` interpolates on viewport
       * width so the headline is 52px on a phone and 88px on a desktop with
       * nothing in between, replacing the `sm:`/`lg:` size jumps that made it
       * snap between three fixed sizes.
       *
       * Values are tuned for Google Sans Flex, not Inter. Google Sans is the
       * wider and rounder of the two with slightly shorter extenders, which
       * pulls the numbers in two directions: small sizes need *less* negative
       * tracking than Inter wanted (its counters are open and closing them up
       * muddies 12px text), while display sizes need *more*, because the
       * generous sidebearings that make it legible at 13px read as gaps at
       * 84px. Leading is a touch tighter throughout for the same reason.
       */
      fontSize: {
        /** Metadata — stage labels, counters, units. Uppercase mono. */
        meta: ["0.625rem", { lineHeight: "0.875rem", letterSpacing: "0.085em" }],
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.015em" }],
        /** Small UI — card categories, captions, timestamps. */
        "label-sm": ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.002em" }],
        /** Default UI — buttons, nav, chips. */
        label: [
          "0.8125rem",
          { lineHeight: "1.125rem", letterSpacing: "-0.002em" },
        ],
        /** Body — the reading sizes. Leading opens as size drops. */
        "body-sm": ["0.875rem", { lineHeight: "1.6", letterSpacing: "-0.005em" }],
        body: ["0.9375rem", { lineHeight: "1.68", letterSpacing: "-0.008em" }],
        "body-lg": ["1.0625rem", { lineHeight: "1.58", letterSpacing: "-0.013em" }],
        /** Lede — the paragraph under the headline. Fluid 16 → 19px. */
        lede: [
          "clamp(1rem, 0.93rem + 0.3vw, 1.1875rem)",
          { lineHeight: "1.58", letterSpacing: "-0.015em" },
        ],
        /** Titles — card headings, section heads. */
        "title-sm": [
          "0.9375rem",
          { lineHeight: "1.35", letterSpacing: "-0.015em" },
        ],
        title: ["1.25rem", { lineHeight: "1.24", letterSpacing: "-0.026em" }],
        /** Display — hero only. Fluid 32 → 48px and 52 → 88px. */
        "display-sm": [
          "clamp(2rem, 1.5rem + 2vw, 3rem)",
          { lineHeight: "1.03", letterSpacing: "-0.036em" },
        ],
        display: [
          "clamp(3.25rem, 2.1rem + 4.6vw, 5.5rem)",
          { lineHeight: "0.93", letterSpacing: "-0.046em" },
        ],
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
