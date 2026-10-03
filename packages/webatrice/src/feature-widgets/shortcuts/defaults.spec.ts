import { defaults } from './defaults';
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
});
