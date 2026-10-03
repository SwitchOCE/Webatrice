import { createTheme, type Theme } from '@mui/material/styles';

import { PALETTES, type ColorScheme } from './palettes';

/**
 * The MUI theme for a palette. `styles/mui-overrides.css` already paints MUI's surfaces from the
 * design tokens; this keeps the colours MUI computes itself (focus rings, switches, sliders,
 * hover tints, dividers, contrast text) on the same palette and in the same mode, so no MUI
 * component falls back to its default light-blue look.
 */
export function createAppTheme(scheme: ColorScheme): Theme {
  const palette = PALETTES[scheme];
  return createTheme({
    palette: {
      mode: scheme,
      primary: { main: palette['accent-primary'] },
      secondary: { main: palette['accent-secondary'] },
      error: { main: palette['status-danger'] },
      success: { main: palette['status-success'] },
      warning: { main: palette['status-warning'] },
      background: { default: palette['bg-base'], paper: palette['bg-surface'] },
      text: {
        primary: palette['text-primary'],
        secondary: palette['text-secondary'],
        disabled: palette['text-disabled'],
      },
      divider: palette['border-subtle'],
    },
  });
}
