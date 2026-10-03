/** The two palettes the appearance preference chooses between. */
export type ColorScheme = 'light' | 'dark';

/** The design tokens of `styles/tokens.css`, by CSS custom-property name (without `--`). */
export type PaletteToken =
  | 'bg-base'
  | 'bg-surface'
  | 'bg-elevated'
  | 'border-subtle'
  | 'border-strong'
  | 'accent-primary'
  | 'accent-primary-hover'
  | 'accent-secondary'
  | 'text-primary'
  | 'text-secondary'
  | 'text-muted'
  | 'text-disabled'
  | 'status-danger'
  | 'status-success'
  | 'status-warning';

export type Palette = Readonly<Record<PaletteToken, string>>;

/**
 * Every token in both palettes, as hex. CSS reads the tokens from `styles/tokens.css`; this copy
 * exists for the MUI theme, whose palette needs concrete colours. palettes.spec.ts fails if the
 * two drift apart, and checks the contrast of each palette's text on each of its surfaces.
 */
export const PALETTES: Readonly<Record<ColorScheme, Palette>> = {
  dark: {
    'bg-base': '#14101F',
    'bg-surface': '#1F1830',
    'bg-elevated': '#2A2140',
    'border-subtle': '#3A2E5A',
    'border-strong': '#5A4A85',
    'accent-primary': '#9F7AEA',
    'accent-primary-hover': '#B794F4',
    'accent-secondary': '#6B46C1',
    'text-primary': '#F5F0F6',
    'text-secondary': '#C7BFD4',
    'text-muted': '#7A6E8F',
    'text-disabled': '#A89EA5',
    'status-danger': '#F87171',
    'status-success': '#34D399',
    'status-warning': '#FACC15',
  },
  light: {
    'bg-base': '#F6F3FA',
    'bg-surface': '#FFFFFF',
    'bg-elevated': '#EEE9F5',
    'border-subtle': '#DCD3E9',
    'border-strong': '#B4A6CF',
    'accent-primary': '#6B46C1',
    'accent-primary-hover': '#553C9A',
    'accent-secondary': '#9F7AEA',
    'text-primary': '#1D1630',
    'text-secondary': '#463C5C',
    'text-muted': '#675D7E',
    'text-disabled': '#857D84',
    'status-danger': '#B91C1C',
    'status-success': '#047857',
    'status-warning': '#8A5905',
  },
};
