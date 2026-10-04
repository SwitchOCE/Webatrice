import { BROWSER_RESERVED_SEQUENCES } from './browserReserved';
import { allActionIds, defaults } from './defaults';
import type { ActionId } from './types';

describe('shortcut defaults', () => {
  const boundTo = (sequence: string) =>
    (Object.keys(defaults) as ActionId[]).filter((id) => defaults[id].sequences.includes(sequence));

  // Desktop binds Shift+Tab to aNextPhaseAction and leaves previous phase
  // unbound (shortcuts_settings.h); Webatrice moved the key off game.prevPhase.
  it('binds Shift+Tab to next phase with action only', () => {
    expect(boundTo('Shift+Tab')).toEqual(['game.nextPhaseAction']);
  });

  it('leaves previous phase unbound', () => {
    expect(defaults['game.prevPhase'].sequences).toEqual([]);
  });

  // A default on a browser-reserved chord never reaches the page, so it
  // would look bound in the Shortcuts tab and do nothing.
  it.each(BROWSER_RESERVED_SEQUENCES)('binds no action to the browser-reserved %s', (sequence) => {
    expect(boundTo(sequence)).toEqual([]);
  });

  it('checks every action against the reserved list', () => {
    const reserved = new Set(BROWSER_RESERVED_SEQUENCES);
    expect(allActionIds.filter((id) => defaults[id].sequences.some((sequence) => reserved.has(sequence)))).toEqual([]);
  });
});
