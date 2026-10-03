import { ZoneName } from '@cockatrice/sockatrice';

import type { ActionId } from '@app/feature-widgets/shortcuts';

import type { ContextMenuItem } from '../../PlayerBox/ContextMenu';
import {
  buildBattlefieldMenu,
  buildCountersMenu,
  buildHandMenu,
  buildLibraryMenu,
  buildOpponentBattlefieldMenu,
  type HandMenuArgs,
  type LibraryMenuArgs,
} from './playerMenu.model';

// Every hint renders as its action id, so the tree pins which binding each row shows.
const hints = new Proxy({}, { get: (_target, key) => `<${String(key)}>` }) as Record<ActionId, string>;

const OPPONENTS = [{ playerId: 2, name: 'Bob' }];

/** One line per row: label, [shortcut], ✓ when checked, (disabled); submenus indented. */
function tree(items: ContextMenuItem[], depth = 0): string[] {
  return items.flatMap((item) => {
    const pad = '  '.repeat(depth);
    if ('divider' in item) {
      return [`${pad}---`];
    }
    const line = [
      item.checked ? '✓' : '',
      item.label,
      item.shortcut ? `[${item.shortcut}]` : '',
      item.disabled ? '(disabled)' : '',
    ].filter(Boolean).join(' ');
    return [`${pad}${line}`, ...(item.submenu ? tree(item.submenu, depth + 1) : [])];
  });
}

function libraryArgs(overrides: Partial<LibraryMenuArgs> = {}): LibraryMenuArgs {
  const click = () => () => {};
  return {
    shortcutHints: hints,
    seatId: 1,
    deckCount: 40,
    revealTargets: OPPONENTS,
    alwaysRevealTopCard: false,
    alwaysLookAtTopCard: true,
    draw: vi.fn(),
    openZoneView: vi.fn(),
    openDrawCardsPrompt: vi.fn(),
    openViewLibraryCountPrompt: vi.fn(),
    openRevealTopCardsPrompt: vi.fn(),
    openCountPrompt: vi.fn(),
    openMoveTopUntilDialog: vi.fn(),
    buildMoveTopCardTo: click,
    buildMoveBottomCardTo: click,
    promptMoveTopNTo: click,
    promptMoveBottomNTo: click,
    onShuffle: vi.fn(),
    onShuffleRange: vi.fn(),
    ...overrides,
  };
}

function handArgs(overrides: Partial<HandMenuArgs> = {}): HandMenuArgs {
  return {
    shortcutHints: hints,
    seatId: 1,
    isSelf: true,
    handSize: 2,
    handCards: [],
    revealTargets: OPPONENTS,
    openZoneView: vi.fn(),
    handleRequestSortHandBy: vi.fn(),
    handleRequestChooseMulligan: vi.fn(),
    onMoveCards: vi.fn(),
    ...overrides,
  };
}

type MenuRow = Exclude<ContextMenuItem, { divider: true }>;

function find(items: ContextMenuItem[], ...path: string[]): MenuRow {
  let level = items;
  let found: MenuRow | undefined;
  for (const label of path) {
    found = level.find((i): i is MenuRow => 'label' in i && i.label === label);
    if (!found) {
      throw new Error(`no item ${label}`);
    }
    level = found.submenu ?? [];
  }
  return found!;
}

describe('buildLibraryMenu', () => {
  it('lists desktop LibraryMenu rows', () => {
    expect(tree(buildLibraryMenu(libraryArgs()))).toMatchInlineSnapshot(`
      [
        "Draw card [<game.drawCard>]",
        "Draw cards... [<game.drawMultipleCards>]",
        "Undo last draw [<game.undoDraw>]",
        "---",
        "Shuffle [<game.shuffleLibrary>]",
        "---",
        "View library [<game.viewLibrary>]",
        "View top cards of library... [<game.viewTopCards>]",
        "View bottom cards of library... [<game.viewBottomCards>]",
        "---",
        "Reveal library to...",
        "  All players",
        "  ---",
        "  Bob",
        "Lend library to...",
        "  Bob",
        "Reveal top cards to...",
        "  All players",
        "  ---",
        "  Bob",
        "Always reveal top card [<game.alwaysRevealTopCard>]",
        "✓ Always look at top card [<game.alwaysLookAtTopCard>]",
        "---",
        "Top of library...",
        "  Play top card [<game.playTop>]",
        "  Play top card face down",
        "  Put top card on bottom",
        "  ---",
        "  Move top card to graveyard [<game.moveTopToGrave>]",
        "  Move top cards to graveyard... [<game.moveTopNToGrave>]",
        "  Move top cards to graveyard face down...",
        "  Move top card to exile",
        "  Move top cards to exile...",
        "  Move top cards to exile face down...",
        "  Put top cards on stack until… [<game.moveTopUntil>]",
        "  ---",
        "  Shuffle top cards...",
        "Bottom of library...",
        "  Draw bottom card",
        "  Draw bottom cards...",
        "  ---",
        "  Play bottom card",
        "  Play bottom card face down",
        "  Put bottom card on top",
        "  ---",
        "  Move bottom card to graveyard",
        "  Move bottom cards to graveyard...",
        "  Move bottom cards to graveyard face down...",
        "  Move bottom card to exile",
        "  Move bottom cards to exile...",
        "  Move bottom cards to exile face down...",
        "  ---",
        "  Shuffle bottom cards...",
        "---",
        "Open deck in deck editor (disabled)",
      ]
    `);
  });

  it('shuffles the top N as the inclusive range [0, N-1]', () => {
    const args = libraryArgs();
    find(buildLibraryMenu(args), 'Top of library...', 'Shuffle top cards...').onClick?.();
    vi.mocked(args.openCountPrompt).mock.calls[0][0].onSubmit(5);
    expect(args.onShuffleRange).toHaveBeenCalledWith(0, 4);
  });

  it('offers only a placeholder with no other players', () => {
    const items = buildLibraryMenu(libraryArgs({ revealTargets: [] }));
    expect(tree(find(items, 'Reveal library to...').submenu ?? [])).toEqual(['(no players)']);
  });
});

describe('buildHandMenu', () => {
  it('lists desktop HandMenu rows', () => {
    expect(tree(buildHandMenu(handArgs()))).toMatchInlineSnapshot(`
      [
        "View hand",
        "Sort hand by...",
        "  Name",
        "  Type [<game.sortHandByType>]",
        "  Mana Value",
        "Reveal hand to...",
        "  All players",
        "  ---",
        "  Bob",
        "Reveal random card to...",
        "  All players",
        "  ---",
        "  Bob",
        "---",
        "Take mulligan (Choose hand size)",
        "Take mulligan (Same hand size) [<game.mulliganSameSize>]",
        "Take mulligan (Hand size - 1) [<game.mulliganMinusOne>]",
        "---",
        "Move hand to...",
        "  Top of library",
        "  Bottom of library",
        "  ---",
        "  Graveyard",
        "  ---",
        "  Exile",
      ]
    `);
  });

  it('moves every hand card by its wire id', () => {
    const args = handArgs({
      handCards: [{ id: '4', name: 'A', scryfallId: '' }, { id: '9', name: 'B', scryfallId: '' }],
    });
    find(buildHandMenu(args), 'Move hand to...', 'Graveyard').onClick?.();
    expect(args.onMoveCards).toHaveBeenCalledWith(ZoneName.HAND, [4, 9], { zone: ZoneName.GRAVE, index: 0 });
  });
});

describe('buildBattlefieldMenu', () => {
  const counters = buildCountersMenu({
    manaColors: [{ symbol: 'W', label: 'White' }],
    manaCounters: { W: { id: 1, count: 0 } },
    lifeControl: { onDelta: vi.fn() },
    openLifePrompt: vi.fn(),
    openCounterPrompt: vi.fn(),
    onModifyCounter: vi.fn(),
    onSetPlayerCounter: vi.fn(),
  });

  it('lists desktop PlayerMenu rows', () => {
    const items = buildBattlefieldMenu({
      shortcutHints: hints,
      handMenuItems: [],
      libraryMenuItems: [],
      graveMenuItemsSelf: [],
      exileMenuItemsSelf: [],
      countersMenuItems: counters,
      selection: null,
      battlefieldDisplayList: [],
      lastToken: null,
      openCreateTokenDialog: vi.fn(),
      onCreateToken: vi.fn(),
      onRequestViewSideboard: vi.fn(),
      onUntapAll: vi.fn(),
      onFlipCoin: vi.fn(),
    });
    expect(tree(items).filter((line) => !/^ {4}[+-]\d/.test(line))).toMatchInlineSnapshot(`
      [
        "Hand",
        "Library",
        "Graveyard",
        "Exile",
        "Sideboard",
        "  View sideboard [<game.viewSideboard>]",
        "---",
        "Counters",
        "  Life",
        "    Set counter...",
        "    ---",
        "    ---",
        "  White",
        "    Set counter...",
        "    ---",
        "    ---",
        "Increment all card counters [<game.incrementAllCardCounters>] (disabled)",
        "---",
        "Untap all permanents [<game.untapAll>]",
        "---",
        "Roll die... [<game.rollDice>]",
        "Flip coin [<game.flipCoin>]",
        "---",
        "Create token... [<game.createToken>]",
        "Create another token [<game.createAnotherToken>] (disabled)",
        "Create predefined token (disabled)",
        "---",
        "Game info...",
      ]
    `);
  });

  it('narrows the opponent menu to graveyard and exile', () => {
    const items = buildOpponentBattlefieldMenu({ graveMenuItemsOpponent: [], exileMenuItemsOpponent: [] });
    expect(tree(items)).toEqual(['Graveyard', 'Exile']);
  });
});
