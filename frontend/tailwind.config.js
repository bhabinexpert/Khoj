import animate from 'tailwindcss-animate';

/**
 * The design tokens. Everything visual in the app resolves back to this file —
 * three colour families, one type scale, one elevation scale — so the UI reads as
 * a system rather than a pile of one-off decisions.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      spacing: {
        // The one gap in Tailwind's own scale that this UI actually wants: an
        // 18px icon, between the 16px that reads small and the 20px that crowds.
        4.5: '1.125rem',
      },
      colors: {
        /**
         * Text and chrome. A cool, slightly blue-shifted neutral: at the dark end
         * it reads as considered rather than washed out, which pure grey does not.
         */
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#dfe3ea',
          300: '#c6ccd8',
          400: '#98a1b3',
          500: '#6c7689',
          600: '#4f586a',
          700: '#3b4353',
          800: '#252c39',
          900: '#161b25',
          950: '#0c1017',
        },
        /**
         * Nepal's flag crimson, pulled towards the printed colour rather than the
         * screen-candy version of it. Used for exactly three things: the primary
         * action, the active navigation state, and the wordmark.
         */
        brand: {
          50: '#fef2f3',
          100: '#fde3e5',
          200: '#fbcbd0',
          300: '#f7a5ae',
          400: '#f07284',
          500: '#e34158',
          600: '#c8102e',
          700: '#a80e27',
          800: '#8c1024',
          900: '#761223',
          950: '#41050f',
        },
        /** The support widget, and nothing else. Warm enough to read as an aside. */
        momo: {
          50: '#fffaeb',
          100: '#fef0c7',
          200: '#fedf89',
          300: '#fec84b',
          400: '#fdb022',
          500: '#f79009',
          600: '#dc6803',
          700: '#b54708',
          800: '#93370d',
          900: '#7a2e0e',
        },
      },
      fontFamily: {
        // Bundled with the app (@fontsource-variable/inter), not fetched from a CDN:
        // no third-party request on first paint and no flash of a fallback face.
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Display sizes need negative tracking to stop looking loose; Tailwind's
        // defaults are tuned for body copy and get worse the larger you go.
        'display-sm': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['2.375rem', { lineHeight: '1.12', letterSpacing: '-0.025em', fontWeight: '700' }],
        'display-lg': ['3.25rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-xl': ['4rem', { lineHeight: '1.02', letterSpacing: '-0.035em', fontWeight: '700' }],
      },
      boxShadow: {
        // A short, purposeful elevation scale. Anything not on it is a mistake.
        xs: '0 1px 2px 0 rgb(12 16 23 / 0.04)',
        card: '0 1px 2px 0 rgb(12 16 23 / 0.04), 0 1px 3px 0 rgb(12 16 23 / 0.06)',
        lift: '0 8px 24px -8px rgb(12 16 23 / 0.14), 0 2px 6px -2px rgb(12 16 23 / 0.08)',
        pop: '0 16px 40px -12px rgb(12 16 23 / 0.28)',
        'ring-brand': '0 0 0 4px rgb(200 16 46 / 0.12)',
      },
      backgroundImage: {
        // A faint engineering grid behind the hero. Cheaper and calmer than a blob.
        grid: 'linear-gradient(to right, rgb(12 16 23 / 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgb(12 16 23 / 0.045) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '56px 56px',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(2px)' }, to: { opacity: 1, transform: 'none' } },
        'pop-in': {
          from: { opacity: 0, transform: 'translateY(10px) scale(0.96)' },
          to: { opacity: 1, transform: 'none' },
        },
        spin_slow: { to: { transform: 'rotate(360deg)' } },
        // The soft light behind the hero. Kept in CSS (not framer-motion) so it
        // runs on the compositor and never re-renders React.
        aurora: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(3%, -4%, 0) scale(1.08)' },
          '66%': { transform: 'translate3d(-4%, 3%, 0) scale(0.96)' },
        },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        /** The support widget's one movement: a slow, small breath. */
        breathe: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'pop-in': 'pop-in 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        'spin-slow': 'spin_slow 6s linear infinite',
        aurora: 'aurora 22s ease-in-out infinite',
        marquee: 'marquee 40s linear infinite',
        shimmer: 'shimmer 2s infinite',
        breathe: 'breathe 3.6s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
};
