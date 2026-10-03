import fs from 'node:fs';
import path from 'node:path';

import { PALETTES, type ColorScheme, type Palette, type PaletteToken } from './palettes';

/** Parses the `--token: R G B;` declarations of the rule whose selector list contains `selector`. */
function cssPalette(css: string, selector: string): Record<string, string> {
  const rule = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(([, selectors]) =>
    selectors.split(',').some((s) => s.trim() === selector),
  );
  if (!rule) {
    throw new Error(`No rule for ${selector} in tokens.css`);
  }
  const tokens: Record<string, string> = {};
  for (const [, name, r, g, b] of rule[2].matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    tokens[name] = `#${[r, g, b].map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  return tokens;
}

/** WCAG 2.x contrast ratio of two hex colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = fs.readFileSync(path.resolve(__dirname, '../../styles/tokens.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const SELECTORS: Record<ColorScheme, string> = {
  dark: ':root[data-theme=\'dark\']',
  light: ':root[data-theme=\'light\']',
};
const SURFACES: PaletteToken[] = ['bg-base', 'bg-surface', 'bg-elevated'];

describe.each(Object.keys(PALETTES) as ColorScheme[])('the %s palette', (scheme) => {
  const palette: Palette = PALETTES[scheme];

  test('matches styles/tokens.css token for token', () => {
    expect(cssPalette(css, SELECTORS[scheme])).toEqual(palette);
  });

  test.each(SURFACES)('keeps primary and secondary text at AAA contrast on %s', (surface) => {
    expect(contrast(palette['text-primary'], palette[surface])).toBeGreaterThanOrEqual(7);
    expect(contrast(palette['text-secondary'], palette[surface])).toBeGreaterThanOrEqual(7);
  });

  test.each(['bg-base', 'bg-surface'] as PaletteToken[])(
    'keeps the accent and status colours at AA contrast on %s',
    (surface) => {
      for (const token of ['accent-primary', 'status-danger', 'status-success', 'status-warning'] as PaletteToken[]) {
        expect(contrast(palette[token], palette[surface]), token).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  test.each(SURFACES)('keeps muted and disabled text at least 3:1 on %s', (surface) => {
    expect(contrast(palette['text-muted'], palette[surface])).toBeGreaterThanOrEqual(3);
    expect(contrast(palette['text-disabled'], palette[surface])).toBeGreaterThanOrEqual(3);
  });
});

test('dark is the palette of a page without data-theme', () => {
  expect(cssPalette(css, ':root')).toEqual(PALETTES.dark);
});
