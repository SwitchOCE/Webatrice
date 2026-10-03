const hoisted = vi.hoisted(() => ({
  clearDeckEditorCache: vi.fn(),
  clearDecksListCache: vi.fn(),
}));

vi.mock('@app/features/decks', () => hoisted);

import { appShellLifecycle } from './appShellLifecycle';

describe('appShellLifecycle', () => {
  it('drops both deck caches when the signed-in identity changes', () => {
    appShellLifecycle.onIdentityChanged();

    expect(hoisted.clearDeckEditorCache).toHaveBeenCalledTimes(1);
    expect(hoisted.clearDecksListCache).toHaveBeenCalledTimes(1);
  });
});
