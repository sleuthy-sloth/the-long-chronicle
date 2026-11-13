/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        parchment: { DEFAULT: '#f4eedd', deep: '#e8dfca', card: '#faf6ee' },
        ink: { DEFAULT: '#2b241f', soft: '#5c5347', faint: '#8a7f6d' },
        oxblood: { DEFAULT: '#6e1f1f', light: '#8c2f2f', dark: '#4a1515' },
        gold: { DEFAULT: '#a8842c', light: '#c9a44a' },
        charcoal: { DEFAULT: '#1c1917', panel: '#26221e', card: '#2e2823' }
      },
      fontFamily: {
        serif: ['"EB Garamond"', 'Georgia', 'serif'],
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif']
      }
    }
  },
  plugins: []
}
