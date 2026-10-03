import type { BracketSignals } from './bracket';
import { bracketSignalBadges } from './bracketBadges';
import { bracketToneClass } from './bracketTone';

function signals(overrides: Partial<BracketSignals> = {}): BracketSignals {
  return {
    turns: { matches: [], restricted: [] },
    denial: { matches: [], restricted: [] },
    gameChangers: { matches: [] },
    earlyCombos: [],
    lateCombos: [],
    ...overrides,
  };
}

describe('bracketSignalBadges', () => {
  it('renders every badge muted for a clean deck', () => {
    const badges = bracketSignalBadges(signals());
    expect(badges.map((b) => [b.label, b.count, b.tone])).toEqual([
      ['Game Changers', 0, 'muted'],
      ['MLD', 0, 'muted'],
      ['Extra turns', 0, 'muted'],
      ['Early combos', 0, 'muted'],
      ['Late combos', 0, 'muted'],
    ]);
  });

  it('applies the warn and hot thresholds', () => {
    const combo = { id: 'c', cardNames: ['A', 'B'], totalMana: 4 };
    const badges = bracketSignalBadges(signals({
      gameChangers: { matches: ['G1', 'G2', 'G3', 'G4'] },
      turns: { matches: ['T1', 'T2', 'T3'], restricted: [] },
      denial: { matches: [], restricted: ['Armageddon'] },
      earlyCombos: [combo],
      lateCombos: [combo],
    }));
    expect(badges.map((b) => b.tone)).toEqual(['hot', 'hot', 'warn', 'hot', 'warn']);
    expect(badges[1].items).toEqual(['Armageddon']);
    expect(badges[3].items).toEqual(['A + B']);
  });

  it('lists chain-able extra turns after a separator and treats them as hot', () => {
    const [, , turns] = bracketSignalBadges(signals({
      turns: { matches: ['Time Warp'], restricted: ['Nexus of Fate'] },
    }));
    expect(turns.tone).toBe('hot');
    expect(turns.count).toBe(1);
    expect(turns.items).toEqual(['Time Warp', '— chain-able:', 'Nexus of Fate']);
  });
});

describe('bracketToneClass', () => {
  it('maps levels to the shared palette with a neutral fallback', () => {
    expect(bracketToneClass(3)).toBe('text-yellow-300 bg-yellow-500/15 border-yellow-500/40');
    expect(bracketToneClass(9)).toBe('text-text-secondary bg-bg-elevated border-border-subtle');
  });
});
