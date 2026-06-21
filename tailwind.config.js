/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — automatically switch between light/dark via CSS vars
        canvas:  'hsl(var(--canvas) / <alpha-value>)',
        panel:   'hsl(var(--panel) / <alpha-value>)',
        overlay: 'hsl(var(--overlay) / <alpha-value>)',
        line:    'hsl(var(--line) / <alpha-value>)',
        ink: {
          1: 'hsl(var(--ink-1) / <alpha-value>)',
          2: 'hsl(var(--ink-2) / <alpha-value>)',
          3: 'hsl(var(--ink-3) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'hsl(var(--brand) / <alpha-value>)',
          muted:   'hsl(var(--brand-muted) / <alpha-value>)',
          fg:      'hsl(var(--brand-fg) / <alpha-value>)',
        },
        bull: 'hsl(var(--bull) / <alpha-value>)',
        bear: 'hsl(var(--bear) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card:   '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-md': '0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
        'card-lg': '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05)',
      },
    },
  },
  plugins: [],
}
