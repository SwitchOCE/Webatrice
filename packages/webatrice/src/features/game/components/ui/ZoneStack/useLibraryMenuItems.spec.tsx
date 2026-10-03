import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ZoneName } from '@cockatrice/sockatrice';

import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import { NOOP_GAME_DIALOGS_ACTIONS, type GameDialogs } from '../../../hooks/dialogs/gameDialogs.types';
import { GameDialogsProvider } from '../GameDialogsContext';
import type { PlayerZoneCommands } from '../PlayerBoard/playerBoard.types';
import { useLibraryMenuItems, type UseLibraryMenuItemsArgs } from './useLibraryMenuItems';

type Item = Extract<ContextMenuItem, { label: string }>;
const labels = (items: ContextMenuItem[]) => items.map((i) => ('divider' in i ? '---' : i.label));
const find = (items: ContextMenuItem[], ...path: string[]): Item => {
  let item = items.find((i): i is Item => 'label' in i && i.label === path[0])!;
  for (const label of path.slice(1)) {
    item = item.submenu!.find((i): i is Item => 'label' in i && i.label === label)!;
  }
  return item;
};

function setup(args: Partial<UseLibraryMenuItemsArgs> = {}) {
  const openZoneView = vi.fn();
  const zoneCommands = {
    moveCards: vi.fn(),
    reveal: vi.fn(),
    lendLibrary: vi.fn(),
    shuffleLibrary: vi.fn(),
    undoDraw: vi.fn(),
    setAlwaysRevealTopCard: vi.fn(),
    setAlwaysLookAtTopCard: vi.fn(),
  } as unknown as PlayerZoneCommands;
  const props = {
    seatId: 1,
    deckCount: 30,
    revealTargets: [{ playerId: 2, name: 'Opp' }],
    alwaysRevealTopCard: false,
    alwaysLookAtTopCard: true,
    draw: vi.fn(),
    openCountPrompt: vi.fn(),
    openDrawCardsPrompt: vi.fn(),
    openViewLibraryCountPrompt: vi.fn(),
    openRevealTopCardsPrompt: vi.fn(),
    openMoveTopUntilDialog: vi.fn(),
    onOpenDeckInEditor: undefined,
    shortcutHints: {} as UseLibraryMenuItemsArgs['shortcutHints'],
    zoneCommands,
    ...args,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GameDialogsProvider value={{ ...NOOP_GAME_DIALOGS_ACTIONS, openZoneView } as unknown as GameDialogs}>{children}</GameDialogsProvider>
  );
  const { result } = renderHook(() => useLibraryMenuItems(props), { wrapper });
  return { items: result.current.libraryMenuItems, props, openZoneView, zoneCommands };
}

describe('useLibraryMenuItems', () => {
  it('follows desktop LibraryMenu', () => {
    expect(labels(setup().items)).toEqual([
      'Draw card', 'Draw cards...', 'Undo last draw', '---', 'Shuffle', '---',
      'View library', 'View top cards of library...', 'View bottom cards of library...', '---',
      'Reveal library to...', 'Lend library to...', 'Reveal top cards to...',
      'Always reveal top card', 'Always look at top card', '---',
      'Top of library...', 'Bottom of library...', '---', 'Open deck in deck editor',
    ]);
  });

  it('draws, views and reveals', () => {
    const { items, props, openZoneView, zoneCommands } = setup();
    find(items, 'Draw card').onClick!();
    expect(props.draw).toHaveBeenCalledWith(1);
    find(items, 'View library').onClick!();
    expect(openZoneView).toHaveBeenCalledWith({ playerId: 1, zoneName: ZoneName.DECK });
    find(items, 'Reveal library to...', 'All players').onClick!();
    find(items, 'Lend library to...', 'Opp').onClick!();
    expect(zoneCommands.reveal).toHaveBeenCalledWith(ZoneName.DECK, 'all');
    expect(zoneCommands.lendLibrary).toHaveBeenCalledWith(2);
    find(items, 'Reveal top cards to...', 'Opp').onClick!();
    expect(props.openRevealTopCardsPrompt).toHaveBeenCalledWith({ targetPlayerId: 2, targetName: 'Opp', deckSize: 30 });
  });

  it('shows the top-card toggles checked from the zone and flips them', () => {
    const { items, zoneCommands } = setup();
    expect(find(items, 'Always look at top card').checked).toBe(true);
    find(items, 'Always reveal top card').onClick!();
    find(items, 'Always look at top card').onClick!();
    expect(zoneCommands.setAlwaysRevealTopCard).toHaveBeenCalledWith(true);
    expect(zoneCommands.setAlwaysLookAtTopCard).toHaveBeenCalledWith(false);
  });

  it('addresses the top and bottom card by position', () => {
    const { items, zoneCommands } = setup();
    find(items, 'Top of library...', 'Play top card face down').onClick!();
    find(items, 'Bottom of library...', 'Move bottom card to exile').onClick!();
    expect(vi.mocked(zoneCommands.moveCards).mock.calls).toEqual([
      [ZoneName.DECK, [{ id: 0, faceDown: true }], { zone: ZoneName.TABLE, index: 'end' }],
      [ZoneName.DECK, [29], { zone: ZoneName.EXILE, index: 0 }],
    ]);
  });

  it('moves and shuffles N cards through the count prompt', () => {
    const { items, props, zoneCommands } = setup({ deckCount: 5 });
    find(items, 'Bottom of library...', 'Move bottom cards to graveyard face down...').onClick!();
    vi.mocked(props.openCountPrompt).mock.calls[0][0].onSubmit(2);
    expect(zoneCommands.moveCards).toHaveBeenCalledWith(
      ZoneName.DECK, [{ id: 3, faceDown: true }, { id: 4, faceDown: true }], { zone: ZoneName.GRAVE },
    );
    find(items, 'Top of library...', 'Shuffle top cards...').onClick!();
    vi.mocked(props.openCountPrompt).mock.calls[1][0].onSubmit(9);
    expect(zoneCommands.shuffleLibrary).toHaveBeenCalledWith({ start: 0, end: 4 });
  });

  it('disables library actions on an empty library and the deck link without a saved deck', () => {
    const { items } = setup({ deckCount: 0 });
    expect(find(items, 'Draw card').disabled).toBe(true);
    expect(find(items, 'Top of library...').disabled).toBe(true);
    expect(find(items, 'Undo last draw').disabled).toBeUndefined();
    expect(find(items, 'Open deck in deck editor').disabled).toBe(true);
    expect(find(setup({ onOpenDeckInEditor: vi.fn() }).items, 'Open deck in deck editor').disabled).toBe(false);
  });
});
