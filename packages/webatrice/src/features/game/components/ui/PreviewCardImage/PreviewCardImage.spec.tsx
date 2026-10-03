import { act, render, screen, waitFor } from '@testing-library/react';

import { getSettings, settingsStore } from '../../../../../hooks/useSettings';
import { lookupCardsCached } from '../../../../../services/cards/cardCatalog';
import PreviewCardImage from './PreviewCardImage';

vi.mock('../../../../../services/cards/cardCatalog', () => ({
  lookupCardsCached: vi.fn(async (names: string[]) =>
    new Map(names.map((name) => [name, { found: true, source: 'dexie', name, printings: [], landscape: name === 'Invasion of Tarkir' }]))),
}));

const sideways = () => document.querySelector('[data-sideways]');

describe('PreviewCardImage', () => {
  afterEach(() => {
    settingsStore.reset();
  });

  it('turns a sideways-layout card a quarter so it reads upright', async () => {
    render(<PreviewCardImage src="battle.jpg" name="Invasion of Tarkir" />);
    await waitFor(() => expect(sideways()).not.toBeNull());
    expect(sideways()).toHaveStyle({ aspectRatio: '7 / 5' });
    expect(sideways()!.querySelector('img')).toHaveStyle({ transform: 'translate(-50%, -50%) rotate(90deg)' });
  });

  it('leaves a portrait card as it is', async () => {
    render(<PreviewCardImage src="bears.jpg" name="Grizzly Bears" />);
    await waitFor(() => expect(lookupCardsCached).toHaveBeenCalledWith(['Grizzly Bears']));
    expect(sideways()).toBeNull();
    expect(screen.getByRole('presentation')).toHaveStyle({ aspectRatio: '5 / 7' });
  });

  it('never turns a card with "Auto-Rotate cards with sideways layout" off', async () => {
    const settings = await getSettings();
    await act(async () => {
      settingsStore.setValue(Object.assign(settings, { autoRotateSidewaysLayoutCards: false }));
    });
    render(<PreviewCardImage src="battle.jpg" name="Invasion of Tarkir" />);
    await act(async () => {});
    expect(sideways()).toBeNull();
    expect(lookupCardsCached).not.toHaveBeenCalled();
  });
});
