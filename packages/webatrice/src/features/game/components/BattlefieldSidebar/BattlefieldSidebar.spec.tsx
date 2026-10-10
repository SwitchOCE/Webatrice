import { act, render, screen, within } from '@testing-library/react';

import { CardPreviewProvider, createCardPreviewStore } from '../ui/CardPreviewContext';
import BattlefieldSidebar from './BattlefieldSidebar';

vi.mock('../right-sidebar/PlayerList/PlayerList', () => ({ default: () => null }));
vi.mock('../ChatLog/ChatLog', () => ({ default: () => null }));
vi.mock('../GameInviteControls/GameInviteControls', () => ({ default: () => null }));
vi.mock('../GameMenu/GameMenu', () => ({ default: () => null }));
vi.mock('../ui/GameDialogActionsContext', () => ({ useGameDialogActions: () => ({}) }));
vi.mock('../../hooks/useLocalIdentity', () => ({ useLocalIdentity: () => ({ isSpectator: false }) }));
vi.mock('../../hooks/useGameAffordances', () => ({
  useGameAffordances: () => ({ canConcede: false, canUnconcede: false }),
}));
vi.mock('../CardPreviewPopup/useCardPreviewPopup', () => ({
  useCardPreviewPopup: () => ({ isOpen: false, toggle: vi.fn() }),
}));

const ID = '0f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function hover(card: { name: string; scryfallId?: string }) {
  const store = createCardPreviewStore();
  const { container } = render(
    <CardPreviewProvider store={store}>
      <BattlefieldSidebar />
    </CardPreviewProvider>,
  );
  act(() => store.setHoveredCard(card));
  return container.querySelector('img[src*="scryfall"]')?.getAttribute('src');
}

describe('BattlefieldSidebar card preview image', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('previews the hovered printing by Scryfall id', () => {
    expect(hover({ name: 'Rhino, Warrior Token', scryfallId: ID }))
      .toBe(`https://api.scryfall.com/cards/${ID}?format=image&version=png`);
  });

  it('previews a name-only card by its exact name', () => {
    expect(hover({ name: 'Rhino, Warrior Token' }))
      .toBe('https://api.scryfall.com/cards/named?exact=Rhino%2C%20Warrior%20Token&format=image&version=png');
  });
});

describe('BattlefieldSidebar structure', () => {
  it('is a named complementary landmark with a Players heading', () => {
    render(
      <CardPreviewProvider store={createCardPreviewStore()}>
        <BattlefieldSidebar />
      </CardPreviewProvider>,
    );
    const sidebar = screen.getByRole('complementary', { name: 'BattlefieldSidebar.label' });
    expect(within(sidebar).getByRole('heading', { name: 'BattlefieldSidebar.players' })).toBeInTheDocument();
  });
});
