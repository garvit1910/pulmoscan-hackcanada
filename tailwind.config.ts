import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* ── Red-Pink palette ── */
        'peach': '#E8506A',
        'primary-coral': '#E8506A',
        'neon-orange': '#CC2233',
        'dark-base': '#0a0a0a',
        'retro-cream': '#F5C6CC',
        /* legacy aliases */
        'blood-red': '#E8506A',
        'crimson': '#E8506A',
        'dark-red': '#B03050',
        'deep-black': '#0a0a0a',
        'charcoal': '#1A1012',
        'electric-blue': '#E8506A',
      },
      fontFamily: {
        pixel: ['var(--font-press-start)', 'monospace'],
        mono: ['var(--font-vt323)', 'var(--font-jetbrains)', 'monospace'],
        sora: ['var(--font-vt323)', 'var(--font-jetbrains)', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        'pulse-slow': 'pulse-slow 4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'mesh-gradient': 'mesh-gradient 8s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { filter: 'blur(8px) brightness(1)', transform: 'scale(1)' },
          '50%': { filter: 'blur(12px) brightness(1.3)', transform: 'scale(1.02)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'mesh-gradient': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
      },
      boxShadow: {
        'pixel': '4px 4px 0px #000',
        'pixel-sm': '2px 2px 0px #000',
        'coral-glow': '0 0 30px rgba(232, 80, 106, 0.55), 0 0 60px rgba(204, 34, 51, 0.25), 0 0 90px rgba(232, 80, 106, 0.1)',
        'coral-glow-lg': '0 0 50px rgba(232, 80, 106, 0.65), 0 0 100px rgba(204, 34, 51, 0.3), 0 0 140px rgba(232, 80, 106, 0.12)',
        /* legacy aliases */
        'red-glow': '0 0 30px rgba(232, 80, 106, 0.55), 0 0 60px rgba(204, 34, 51, 0.2)',
        'red-glow-lg': '0 0 50px rgba(232, 80, 106, 0.65), 0 0 100px rgba(204, 34, 51, 0.25)',
        'crimson-glow': '0 0 30px rgba(232, 80, 106, 0.55), 0 0 60px rgba(204, 34, 51, 0.2)',
      },
    },
  },
  plugins: [],
}

export default config
