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
        /* ── Peach palette ── */
        'peach': '#FF775E',
        'primary-coral': '#FF775E',
        'dark-base': '#0a0a0a',
        'retro-cream': '#FFF1E6',
        /* legacy aliases */
        'blood-red': '#FF775E',
        'crimson': '#FF775E',
        'dark-red': '#CC5F4B',
        'deep-black': '#0a0a0a',
        'charcoal': '#1A1210',
        'electric-blue': '#FF775E',
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
        'coral-glow': '0 0 20px rgba(255, 119, 94, 0.5)',
        'coral-glow-lg': '0 0 40px rgba(255, 119, 94, 0.6)',
        /* legacy aliases */
        'red-glow': '0 0 20px rgba(255, 119, 94, 0.5)',
        'red-glow-lg': '0 0 40px rgba(255, 119, 94, 0.6)',
        'crimson-glow': '0 0 20px rgba(255, 119, 94, 0.5)',
      },
    },
  },
  plugins: [],
}

export default config
