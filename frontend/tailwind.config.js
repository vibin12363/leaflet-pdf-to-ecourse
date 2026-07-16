/** Leaflet design tokens — paper, ink, pine, highlighter */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAFAF5',
        ink: '#1C2321',
        pine: { DEFAULT: '#2F5D46', dark: '#234736' },
        marker: '#E8F566',
        graphite: '#66706B',
        line: '#E3E2D9',
        brick: '#B4452E',
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['"Atkinson Hyperlegible"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
