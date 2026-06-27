/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic theme colors. Text + border use a white/black base channel
        // combined with alpha modifiers in class names (e.g. text-text-primary/95,
        // border-theme-border/8) to match the Termius rgba(255,255,255,0.x) spec.
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          highlight: 'rgb(var(--c-surface-highlight) / <alpha-value>)',
          elevated: 'rgb(var(--c-surface-elevated) / <alpha-value>)',
        },
        sidebar: 'rgb(var(--c-sidebar) / <alpha-value>)',
        'theme-border': 'rgb(var(--c-border) / <alpha-value>)',
        'text-primary': 'rgb(var(--c-text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--c-text-secondary) / <alpha-value>)',
        'text-tertiary': 'rgb(var(--c-text-tertiary) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          foreground: 'rgb(var(--c-accent-foreground) / <alpha-value>)',
        },
        // Status colors
        success: 'rgb(var(--c-success) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        error: 'rgb(var(--c-error) / <alpha-value>)',
      },
      borderRadius: {
        // Termius spec: 8–12px rounded everywhere, no sharp corners.
        DEFAULT: '0.5rem',   // 8px
        'xl': '0.75rem',     // 12px
        '2xl': '1rem',       // 16px
      },
    },
  },
  plugins: [],
}
