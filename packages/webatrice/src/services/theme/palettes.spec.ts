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

/** `color` painted at `alpha` over `under`, as hex. */
function composite(color: string, alpha: number, under: string): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) => Math.round(alpha * channel(color, i) + (1 - alpha) * channel(under, i)).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

// The lightest art a label can sit on: a white card frame or a blown-out sky.
const LIGHTEST_ART = '#FFFFFF';

/** The opacity of the backdrop behind the selection count labels, read from the component. */
const selectionLabelBackdropAlpha = Number(
  /bg-over-art-backdrop\/(\d+)/.exec(fs.readFileSync(
    path.resolve(__dirname, '../../features/game/components/SelectionCount/SelectionCount.tsx'),
    'utf8',
  ))![1],
) / 100;

const css = fs.readFileSync(path.resolve(__dirname, '../../styles/tokens.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const SELECTORS: Record<ColorScheme, string> = {
  dark: ':root[data-theme=\'dark\']',
  light: ':root[data-theme=\'light\']',
};
const SURFACES: PaletteToken[] = ['bg-base', 'bg-surface', 'bg-elevated'];

const SRC = path.resolve(__dirname, '../..');

/** Every .tsx file under `dir`. */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.spec.tsx') ? [full] : [];
  });
}

describe.each(Object.keys(PALETTES) as ColorScheme[])('the %s palette', (scheme) => {
  const palette: Palette = PALETTES[scheme];

  test('matches styles/tokens.css token for token', () => {
    expect(cssPalette(css, SELECTORS[scheme])).toEqual(palette);
  });

  test('keeps white text on secondary action buttons at AA contrast', () => {
    expect(contrast('#FFFFFF', palette['accent-secondary'])).toBeGreaterThanOrEqual(4.5);
  });

  test('keeps white labels on secondary actions at AA, including hover', () => {
    // The deck editor's buy and card-preview actions, the card detail dialog and the phase track's pass button.
    const actions = sourceFiles(SRC)
      .flatMap((file) => fs.readFileSync(file, 'utf8').split('\n'))
      .filter((line) => line.includes('bg-accent-secondary') && line.includes('text-white'));
    expect(actions.length).toBeGreaterThanOrEqual(3);
    for (const action of actions) {
      for (const [, secondary, opacity] of action.matchAll(/(?:hover:)?bg-accent(-secondary)?(?:\/(\d+))?(?=\s)/g)) {
        const background = palette[secondary ? 'accent-secondary' : 'accent-primary'];
        const alpha = opacity ? Number(opacity) / 100 : 1;
        for (const surface of SURFACES) {
          const blended = '#' + [1, 3, 5].map((index) => Math.round(
            parseInt(background.slice(index, index + 2), 16) * alpha
            + parseInt(palette[surface].slice(index, index + 2), 16) * (1 - alpha),
          ).toString(16).padStart(2, '0')).join('');
          expect(contrast('#FFFFFF', blended), `on ${surface}: ${action.trim()}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
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

  test.each(SURFACES)('keeps muted text, which carries readable hints, at AA contrast on %s', (surface) => {
    expect(contrast(palette['text-muted'], palette[surface])).toBeGreaterThanOrEqual(4.5);
  });

  test.each(['bg-base', 'bg-surface'] as PaletteToken[])(
    'keeps the board\'s selection, attach and doesn\'t-untap rings at 3:1 on %s',
    (surface) => {
      for (const token of ['seat-select', 'seat-attach', 'seat-doesnt-untap'] as PaletteToken[]) {
        expect(contrast(palette[token], palette[surface]), token).toBeGreaterThanOrEqual(3);
      }
    },
  );

  test('keeps text on the cards\' solid label pills, a modified P/T included, at AA contrast', () => {
    for (const token of ['over-art-text', 'pt-modified'] as PaletteToken[]) {
      expect(contrast(palette[token], palette['over-art-backdrop']), token).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('keeps the selection counts at AA contrast on their translucent backdrop over the lightest art', () => {
    const backdrop = composite(palette['over-art-backdrop'], selectionLabelBackdropAlpha, LIGHTEST_ART);
    expect(contrast(palette['over-art-text'], backdrop)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(SURFACES)('keeps disabled text at least 3:1 on %s', (surface) => {
    expect(contrast(palette['text-disabled'], palette[surface])).toBeGreaterThanOrEqual(3);
  });

  test.each(['accent-primary', 'accent-primary-hover'] as PaletteToken[])(
    'keeps text on the %s fill (primary buttons) at AA contrast',
    (fill) => {
      expect(contrast(palette['text-on-accent'], palette[fill])).toBeGreaterThanOrEqual(4.5);
    },
  );

  test.each(SURFACES)('keeps form-control edges at the 3:1 non-text minimum on %s (WCAG 1.4.11)', (surface) => {
    expect(contrast(palette['border-control'], palette[surface])).toBeGreaterThanOrEqual(3);
  });

  test('keeps the danger colour readable as error text on every surface', () => {
    for (const surface of SURFACES) {
      expect(contrast(palette['status-danger'], palette[surface]), surface).toBeGreaterThanOrEqual(4.5);
    }
  });
});

test('keeps the mana tints and the life flashes the same in both palettes, on purpose', () => {
  // They sit on card art and avatars, not on the page, so the light theme leaves them alone. A
  // light-theme change to them has to come with its own contrast check.
  const shared: PaletteToken[] = [
    'mana-w', 'mana-u', 'mana-b', 'mana-r', 'mana-g', 'mana-c', 'mana-o', 'seat-flash-gain', 'seat-flash-loss',
  ];
  for (const token of shared) {
    expect(PALETTES.light[token], token).toBe(PALETTES.dark[token]);
  }
});

test('dark is the palette of a page without data-theme', () => {
  expect(cssPalette(css, ':root')).toEqual(PALETTES.dark);
});
