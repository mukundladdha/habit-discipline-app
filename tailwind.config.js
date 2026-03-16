/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          bg: '#0f172a',
          card: '#1e293b',
          accent: '#22c55e',
          muted: '#94a3b8',
        },
      },
      boxShadow: {
        card: '0 2px 12px -2px rgba(0,0,0,0.4), 0 4px 20px -4px rgba(0,0,0,0.3)',
        'card-hover': '0 8px 28px -4px rgba(0,0,0,0.5), 0 8px 20px -6px rgba(0,0,0,0.4)',
      },
      keyframes: {
        'check-pop': {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '50%': { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'bounce-subtle': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        },
      },
      animation: {
        'check-pop': 'check-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'bounce-subtle': 'bounce-subtle 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
