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
        },
        glass: {
          bg: 'rgba(15, 17, 30, 0.65)',
          border: 'rgba(255, 255, 255, 0.1)',
          hover: 'rgba(255, 255, 255, 0.15)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 25px -5px rgba(99, 102, 241, 0.3)',
        'glow-cyan': '0 0 25px -5px rgba(6, 182, 212, 0.3)',
        'glow-pink': '0 0 25px -5px rgba(236, 72, 153, 0.3)',
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      animation: {
        'fade-up': 'fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'pulse-glow': 'pulseGlow 3s infinite alternate',
        'orbit-spin': 'orbitSpin 12s linear infinite',
        blink: 'blink 1s step-end infinite',
        shimmer: 'shimmer 2.5s infinite linear',
        'bounce-dot': 'bounceDot 1.3s infinite ease-in-out',
        'stream-in': 'streamIn 0.35s ease-out',
        'caret': 'caret 1.05s ease-in-out infinite',
        'border-flow': 'borderFlow 3s linear infinite',
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
        blink: {
          '50%': { opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
