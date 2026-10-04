import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

/** Preflight is on: MUI's CssBaseline was removed alongside the theme,
 *  so preflight now provides the button/anchor/heading/box-sizing
 *  reset for the whole app. Matches fancy webatrice's setup exactly.
 *  Tokens mirror fancy webatrice's palette — colors are stored as
 *  space-separated RGB channels so <alpha-value> works:
 *  rgb(var(--x) / 0.5). See src/styles/tokens.css. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Cinzel', 'serif'],
        modern: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: {
          base: 'rgb(var(--bg-base) / <alpha-value>)',
          surface: 'rgb(var(--bg-surface) / <alpha-value>)',
          elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
        },
        border: {
          subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
          // Form-control edges, at 3:1 against every surface (border-border-control).
          control: 'rgb(var(--border-control) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent-primary) / <alpha-value>)',
          hover: 'rgb(var(--accent-primary-hover) / <alpha-value>)',
          secondary: 'rgb(var(--accent-secondary) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
        },
        // Text and icons on an accent fill (text-on-accent).
        'on-accent': 'rgb(var(--text-on-accent) / <alpha-value>)',
        // Status text that stays legible on both palettes (text-danger, text-success, ...).
        danger: 'rgb(var(--status-danger) / <alpha-value>)',
        success: 'rgb(var(--status-success) / <alpha-value>)',
        warning: 'rgb(var(--status-warning) / <alpha-value>)',
        // Board: selection / attach / doesn't-untap rings, and text drawn over card art.
        seat: {
          select: 'rgb(var(--seat-select) / <alpha-value>)',
          attach: 'rgb(var(--seat-attach) / <alpha-value>)',
          'doesnt-untap': 'rgb(var(--seat-doesnt-untap) / <alpha-value>)',
        },
        'over-art': {
          text: 'rgb(var(--over-art-text) / <alpha-value>)',
          backdrop: 'rgb(var(--over-art-backdrop) / <alpha-value>)',
          // The life total's heart, over the avatar.
          life: 'rgb(var(--over-art-life) / <alpha-value>)',
        },
        'pt-modified': 'rgb(var(--pt-modified) / <alpha-value>)',
      },
      boxShadow: {
        glow: '0 0 24px -4px rgb(var(--accent-primary) / 0.35)',
      },
      backgroundImage: {
        'purple-radial':
          'radial-gradient(ellipse at top, rgb(var(--accent-secondary) / 0.18), transparent 60%)',
      },
    },
  },
  plugins: [
    // `light:` styles an element only under the light palette (see src/styles/tokens.css). Dark
    // is the default, so decorative hues tuned for it need only a light override, e.g.
    // `text-sky-400 light:text-sky-700`. Prefer a token when the colour has a role.
    plugin(({ addVariant }) => {
      addVariant('light', ':root[data-theme="light"] &');
    }),
  ],
} satisfies Config;
