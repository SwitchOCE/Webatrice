import { computeArtSourceRect, coverFitRect, playmatImageBox } from './playmatCrop';

const CARD = { width: 672, height: 936 };
const DEFAULTS = { marginPctL: 0.07, marginPctR: 0.07, verticalOffset: 0.33, zoom: 1 };

describe('computeArtSourceRect', () => {
  it('trims the margins into a square window placed by the vertical offset', () => {
    const rect = computeArtSourceRect(CARD, DEFAULTS);
    expect(rect.width).toBeCloseTo(577.92);
    expect(rect.height).toBeCloseTo(577.92);
    expect(rect.x).toBeCloseTo(47.04);
    expect(rect.y).toBeCloseTo(0.33 * (936 - 577.92));
  });

  it('zooms into the trimmed span, centred between the margins', () => {
    const rect = computeArtSourceRect(CARD, { ...DEFAULTS, zoom: 2 });
    expect(rect.width).toBeCloseTo(288.96);
    expect(rect.x).toBeCloseTo(47.04 + (577.92 - 288.96) / 2);
  });

  it('floors the zoom-out so the window never exceeds the card', () => {
    const rect = computeArtSourceRect(CARD, { marginPctL: 0, marginPctR: 0, verticalOffset: 1, zoom: 0.1 });
    expect(rect).toEqual({ x: 0, y: 936 - 672, width: 672, height: 672 });
  });

  it('caps the zoom-out floor at 4x like desktop', () => {
    const wide = { width: 936, height: 100 };
    const rect = computeArtSourceRect(wide, { marginPctL: 0, marginPctR: 0, verticalOffset: 0, zoom: 1 });
    expect(rect).toEqual({ x: (936 - 234) / 2, y: 0, width: 234, height: 234 });
  });

  it('collapses when the margins leave nothing visible', () => {
    expect(computeArtSourceRect(CARD, { ...DEFAULTS, marginPctL: 0.95, marginPctR: 0.95 }).width).toBe(0);
  });
});

describe('coverFitRect', () => {
  it('overflows vertically when the area is wider than the source', () => {
    expect(coverFitRect({ x: 0, y: 0, width: 1000, height: 300 }, { width: 1, height: 1 }))
      .toEqual({ x: 0, y: -350, width: 1000, height: 1000 });
  });

  it('overflows horizontally when the area is taller than the source', () => {
    expect(coverFitRect({ x: 10, y: 0, width: 200, height: 400 }, { width: 1, height: 1 }))
      .toEqual({ x: -90, y: 0, width: 400, height: 400 });
  });
});

describe('playmatImageBox', () => {
  it('scales the card so the crop window lands on the cover rect', () => {
    const box = playmatImageBox(CARD, DEFAULTS, { width: 1000, height: 300 })!;
    const scale = 1000 / 577.92;
    expect(box.width).toBeCloseTo(672 * scale);
    expect(box.height).toBeCloseTo(936 * scale);
    expect(box.x).toBeCloseTo(-47.04 * scale);
    expect(box.y).toBeCloseTo(-350 - 0.33 * (936 - 577.92) * scale);
  });

  it('returns null for an empty area or crop', () => {
    expect(playmatImageBox(CARD, DEFAULTS, { width: 0, height: 300 })).toBeNull();
    expect(playmatImageBox(CARD, { ...DEFAULTS, marginPctL: 0.95, marginPctR: 0.95 }, { width: 100, height: 100 })).toBeNull();
  });
});
