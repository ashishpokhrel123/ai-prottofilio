import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#07070e',
          900: '#07070e',
          800: '#0d0e17',
          700: '#141624',
          600: '#1e2136',
        },
        brand: {
          violet: '#6366f1',
          indigo: '#4f46e5',
          cyan: '#06b6d4',
          pink: '#ec4899',
          emerald: '#10b981',
          amber: '#f59e0b',
          // Rich new accent shades
          lavender: '#818cf8',
          rose: '#f472b6',
          sky: '#22d3ee',
          mint: '#34d399',
        },
        glass: {
          bg: 'rgba(15, 17, 30, 0.65)',
          border: 'rgba(255, 255, 255, 0.1)',
          hover: 'rgba(255, 255, 255, 0.15)',
        },
        // Category accent colors for suggested prompts
        accent: {
          bio: '#a78bfa',      // violet-400
          projects: '#f472b6', // pink-400
          arch: '#22d3ee',     // cyan-400
          skills: '#34d399',   // emerald-400
          career: '#fbbf24',   // amber-400
          cloud: '#60a5fa',    // blue-400
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 25px -5px rgba(99, 102, 241, 0.3)',
        'glow-lg': '0 0 40px -5px rgba(99, 102, 241, 0.4)',
        'glow-cyan': '0 0 25px -5px rgba(6, 182, 212, 0.3)',
        'glow-pink': '0 0 25px -5px rgba(236, 72, 153, 0.3)',
        'glow-brand': '0 0 60px -12px rgba(99, 102, 241, 0.5), 0 0 30px -8px rgba(6, 182, 212, 0.3)',
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-lg': '0 12px 48px 0 rgba(0, 0, 0, 0.5)',
        'inner-glow': 'inset 0 1px 12px 0 rgba(99, 102, 241, 0.15)',
      },
      animation: {
        'fade-up': 'fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'pulse-glow': 'pulseGlow 3s infinite alternate',
        'orbit-spin': 'orbitSpin 12s linear infinite',
        'orbit-spin-reverse': 'orbitSpinReverse 18s linear infinite',
        blink: 'blink 1s step-end infinite',
        shimmer: 'shimmer 2.5s infinite linear',
        'bounce-dot': 'bounceDot 1.3s infinite ease-in-out',
        'stream-in': 'streamIn 0.35s ease-out',
        caret: 'caret 1.05s ease-in-out infinite',
        'border-flow': 'borderFlow 3s linear infinite',
        // New premium animations
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float 10s ease-in-out infinite',
        'float-delayed': 'float 8s ease-in-out 2s infinite',
        'gradient-shift': 'gradientShift 8s ease infinite',
        sparkle: 'sparkle 2s ease-in-out infinite',
        'aurora-drift': 'auroraDrift 20s ease-in-out infinite',
        'aurora-drift-alt': 'auroraDrift 25s ease-in-out 5s infinite reverse',
        'glow-pulse-ring': 'glowPulseRing 2.5s ease-in-out infinite',
        'dot-pulse': 'dotPulse 1.8s ease-in-out infinite',
      },
      keyframes: {
        bounceDot: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.35' },
          '40%': { transform: 'translateY(-5px)', opacity: '1' },
        },
        streamIn: {
          '0%': { opacity: '0', filter: 'blur(6px)', transform: 'translateY(2px)' },
          '100%': { opacity: '1', filter: 'blur(0)', transform: 'translateY(0)' },
        },
        caret: {
          '0%, 100%': { opacity: '1', transform: 'scaleY(1)' },
          '50%': { opacity: '0.25', transform: 'scaleY(0.8)' },
        },
        borderFlow: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseGlow: {
          '0%': { opacity: '0.4', transform: 'scale(0.98)' },
          '100%': { opacity: '0.8', transform: 'scale(1.02)' },
        },
        orbitSpin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        orbitSpinReverse: {
          '0%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        blink: {
          '50%': { opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // New premium keyframes
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        sparkle: {
          '0%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '50%': { opacity: '1', transform: 'scale(1.2)' },
        },
        auroraDrift: {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '0.12' },
          '33%': { transform: 'translate(30px, -25px) scale(1.1)', opacity: '0.18' },
          '66%': { transform: 'translate(-20px, 15px) scale(0.95)', opacity: '0.1' },
          '100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.12' },
        },
        glowPulseRing: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(99, 102, 241, 0.4)', opacity: '1' },
          '50%': { boxShadow: '0 0 0 8px rgba(99, 102, 241, 0)', opacity: '0.7' },
        },
        dotPulse: {
          '0%, 100%': { opacity: '0.15' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
