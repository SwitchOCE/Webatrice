// Characterization barrier for the card-ops and targeting seam (aud2 R1).
//
// These specs pin, through <Game /> with real Redux state, the real seat ports
// and a mock WebClient, what every seat shortcut action, every battlefield card
// menu action and both arrow paths (the right-button drag and the menu's
// "Draw arrow..." / "Attach to card..." picks) send TODAY. The refactor moves
// that behaviour into battlefieldSelectionOps / useBattlefieldCardOps and one
// pending-target owner; a failure here means it changed behaviour, not that the
// spec needs updating. Assertions are on the wire (`webClient.request.game.*`).

import { act, fireEvent, screen } from '@testing-library/react';
import { Phase } from '@cockatrice/datatrice';
import { makeArrow, makeCard } from '@cockatrice/datatrice/testing';
import { ZoneName } from '@cockatrice/sockatrice';
import { CardAttribute } from '@cockatrice/sockatrice/generated';

import { ArrowColor, PREFERENCE_DEFAULTS } from '@app/types';
import { usePreference } from '../../hooks/useSettings';
import { createMockWebClient, renderWithProviders } from '../../__test-utils__';
import {
  buildSeatGameState,
  cardEl,
  chooseMenuPath,
  LIFE_COUNTER_ID,
  MANA_COUNTER_IDS,
  openContextMenu,
  pileEl,
  pointerDrag,
  type SeatGameSpec,
} from './__test-utils__/seatFixtures';
import { SEAT_SHORTCUT_ACTIONS, type SeatShortcutActionId, type SeatShortcutRegistry } from './components/ui/SeatShortcutsContext';
import Game from './Game';

const captured = vi.hoisted(() => ({ registry: null as SeatShortcutRegistry | null }));

vi.mock('./components/ui/SeatShortcutsContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/ui/SeatShortcutsContext')>();
  return {
    ...actual,
    createSeatShortcutRegistry: () => {
      const registry = actual.createSeatShortcutRegistry();
      captured.registry = registry;
      return registry;
    },
  };
});

vi.mock('../../hooks/useSettings');

vi.mock('../../services/cards/catalog/lookup', () => {
  const unknown = (name: string) => ({ found: false, source: 'unknown', name, printings: [] });
  return {
    lookupCard: vi.fn(async (name: string) => unknown(name)),
    lookupCards: vi.fn(async (inputs: Array<string | { name: string }>) =>
      new Map(inputs.map((i) => {
        const name = typeof i === 'string' ? i : i.name;
        return [name, unknown(name)];
      }))),
    lookupCardsCached: vi.fn(async (names: string[]) => new Map(names.map((n) => [n, unknown(n)]))),
    fetchAllPrintings: vi.fn(async () => []),
  };
});

// The play-then-arrow path reads the card's tablerow and printed P/T from the
// card database.
vi.mock('../../services/dexie/DexieDTOs/CardDTO', () => ({
  CardDTO: { get: vi.fn(async () => ({ tablerow: { value: '1' }, prop: { value: { pt: { value: '2/2' } } } })) },
}));

// Local seat 1: Ogre (3/3, two A counters and a B counter), a face-down
// Morph and a Wall on the back row; a Shock in hand; an arrow from Ogre to
// the Bear. Opponent seat 2: a Bear.
const OGRE = makeCard({ id: 10, name: 'Ogre', x: 0, y: 0, pt: '3/3', counterList: [{ id: 0, value: 2 }, { id: 1, value: 1 }] });
const MORPH = makeCard({ id: 11, name: 'Morph', x: 3, y: 0, faceDown: true });
const WALL = makeCard({ id: 12, name: 'Wall', x: 0, y: 2, pt: '0/4', annotation: 'note', doesntUntap: true });
const SHOCK = makeCard({ id: 30, name: 'Shock' });
const BEAR = makeCard({ id: 20, name: 'Bear', x: 0, y: 0, pt: '2/2' });

const SPEC: SeatGameSpec = {
  localPlayerId: 1,
  seats: [
    { playerId: 1, table: [OGRE, MORPH, WALL], hand: [SHOCK], deckCount: 40 },
    { playerId: 2, table: [BEAR], handCount: 5, deckCount: 33 },
  ],
};

const OWN_ARROW = makeArrow({ id: 7, startPlayerId: 1, startCardId: 10, targetPlayerId: 2, targetCardId: 20 });

function renderGame(spec: SeatGameSpec = SPEC) {
  const webClient = createMockWebClient();
  const preloadedState = buildSeatGameState(spec);
  preloadedState.games!.games![1]!.players![1]!.arrows = { [OWN_ARROW.id]: OWN_ARROW };
  const utils = renderWithProviders(<Game />, { preloadedState, webClient });
  return { ...utils, game: webClient.request.game };
}

type GameRequests = ReturnType<typeof createMockWebClient>['request']['game'];

/** Every game request sent so far, as `[method, params]` (plus the judge
 *  target, or the command options, when one was passed). */
function wire(game: GameRequests) {
  return Object.entries(game).flatMap(([method, fn]) =>
    vi.isMockFunction(fn)
      ? fn.mock.calls.map(([, params, ...rest], index) => {
        const extra = rest.filter((arg) => arg !== undefined);
        return {
          order: fn.mock.invocationCallOrder[index],
          call: extra.length ? [method, params, ...extra.map((arg) => (typeof arg === 'object' ? 'options' : arg))] : [method, params],
        };
      })
      : [],
  ).sort((a, b) => a.order - b.order).map(({ call }) => call);
}

function click(el: Element, init: { ctrlKey?: boolean } = {}) {
  act(() => {
    fireEvent.pointerDown(el, { button: 0, clientX: 50, clientY: 50 });
  });
  act(() => {
    fireEvent.pointerUp(window, { button: 0, clientX: 50, clientY: 50, ...init });
  });
}

/** Select Ogre and the face-down Morph on the local battlefield. */
function selectOgreAndMorph() {
  click(cardEl(OGRE.id, 'battlefield'));
  click(cardEl(MORPH.id, 'battlefield'), { ctrlKey: true });
}

const selectedCards = () =>
  Array.from(document.querySelectorAll('[data-card][data-selected]')).map(
    (el) => `${el.getAttribute('data-zone')}:${el.getAttribute('data-card-id')}`,
  );

const dialogNames = () =>
  screen.queryAllByRole('dialog').map(
    (d) => d.getAttribute('aria-label') ?? document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent,
  );

function runShortcut(id: SeatShortcutActionId) {
  let ran = false;
  act(() => {
    ran = captured.registry?.run(id) ?? false;
  });
  return ran;
}

const table = (cardId: number) => ({ zone: ZoneName.TABLE, cardId });
const attr = (cardId: number, attribute: CardAttribute, attrValue: string) =>
  ['setCardAttr', { ...table(cardId), attribute, attrValue }];

afterEach(() => {
  captured.registry = null;
  vi.restoreAllMocks();
  // clearAllMocks keeps implementations: restore the preference defaults.
  vi.mocked(usePreference).mockImplementation(
    ((key: keyof typeof PREFERENCE_DEFAULTS) => PREFERENCE_DEFAULTS[key]) as typeof usePreference,
  );
});

describe('seat shortcut actions, with Ogre and the face-down Morph selected', () => {
  // What each seat action does from that selection: the requests
  // it sends, the dialog it opens, or the selection it leaves.
  const EXPECTED: Record<SeatShortcutActionId, { wire?: unknown[]; dialogs?: unknown[]; selected?: string[] }> = {
    'game.mulligan': { dialogs: ['Take mulligan'] },
    'game.setLife': { dialogs: ['Set life total'] },
    'game.removeLocalArrows': { wire: [['deleteArrow', { arrowId: 7 }]] },
    'game.doesntUntap': {
      wire: [attr(10, CardAttribute.AttrDoesntUntap, '1'), attr(11, CardAttribute.AttrDoesntUntap, '1')],
    },
    'game.moveTopUntil': { dialogs: ['Put top cards on stack until'] },
    'game.alwaysRevealTopCard': { wire: [['changeZoneProperties', { zoneName: ZoneName.DECK, alwaysRevealTopCard: true }]] },
    'game.alwaysLookAtTopCard': { wire: [['changeZoneProperties', { zoneName: ZoneName.DECK, alwaysLookAtTopCard: true }]] },
    'game.viewTopCards': { dialogs: ['View top cards of library'] },
    'game.viewBottomCards': { dialogs: ['View bottom cards of library'] },
    'game.createToken': { dialogs: ['Create token'] },
    'game.createAnotherToken': { wire: [['createToken', {
      zone: ZoneName.TABLE, cardName: 'Goblin', cardProviderId: '', color: 'w', pt: '1/1',
      annotation: 'ETB', destroyOnZoneChange: true, faceDown: false, x: -1, y: 1,
    }]] },
    'game.drawArrow': {},
    'game.resetPT': { wire: [setPT(10, '')] },
    'game.reduceLifeByPower': { wire: [['incCounter', { counterId: LIFE_COUNTER_ID, delta: -3 }, 'options']] },
    'game.addStormCounter': { wire: [['incCounter', { counterId: MANA_COUNTER_IDS.storm, delta: 1 }, 'options']] },
    'game.removeStormCounter': { wire: [['incCounter', { counterId: MANA_COUNTER_IDS.storm, delta: -1 }, 'options']] },
    'game.setStormCounter': { dialogs: ['Set other counter'] },
    'game.attachCard': {},
    'game.peekCard': { wire: [['bulkPeek', [{ ownerPlayerId: 1, zone: ZoneName.TABLE, card: { id: 11 } }], 1]] },
    'game.flipCard': {
      wire: [
        ['flipCard', { ...table(10), faceDown: true }],
        ['flipCard', { ...table(11), faceDown: true }],
      ],
    },
    'game.unattachCard': {
      wire: [
        ['attachCard', { startZone: ZoneName.TABLE, cardId: 10 }],
        ['attachCard', { startZone: ZoneName.TABLE, cardId: 11 }],
      ],
    },
    'game.moveSelectedToGrave': { wire: [['moveCard', moveFromTable([10, 11], ZoneName.GRAVE, 0, false)]] },
    'game.setCardPT': { dialogs: ['Set power and toughness'] },
    'game.incP': { wire: [setPT(10, '4/3'), setPT(11, '1/0')] },
    'game.decP': { wire: [setPT(10, '2/3'), setPT(11, '-1/0')] },
    'game.incT': { wire: [setPT(10, '3/4'), setPT(11, '0/1')] },
    'game.decT': { wire: [setPT(10, '3/2'), setPT(11, '0/-1')] },
    'game.incPT': { wire: [setPT(10, '4/4'), setPT(11, '1/1')] },
    'game.decPT': { wire: [setPT(10, '2/2'), setPT(11, '-1/-1')] },
    'game.selectAllBattlefield': { selected: ['battlefield:10', 'battlefield:11', 'battlefield:12'] },
    'game.selectRowBattlefield': { selected: ['battlefield:10', 'battlefield:11'] },
    'game.selectColumnBattlefield': { selected: ['battlefield:10', 'battlefield:12'] },
    'game.addCounterA': { wire: [['bulkSetCardCounterEntries', counters([10, 0, 3], [11, 0, 1])]] },
    'game.removeCounterA': { wire: [['bulkSetCardCounterEntries', counters([10, 0, 1])]] },
    'game.setCounterA': { dialogs: ['Set counter A'] },
    'game.addCounterB': { wire: [['bulkSetCardCounterEntries', counters([10, 1, 2], [11, 1, 1])]] },
    'game.removeCounterB': { wire: [['bulkSetCardCounterEntries', counters([10, 1, 0])]] },
    'game.setCounterB': { dialogs: ['Set counter B'] },
    'game.addCounterC': { wire: [['bulkSetCardCounterEntries', counters([10, 2, 1], [11, 2, 1])]] },
    'game.removeCounterC': { wire: [['bulkSetCardCounterEntries', counters([10, 2, 2])]] },
    'game.setCounterC': { dialogs: ['Set counter C'] },
    'game.incrementAllCardCounters': { wire: [['bulkSetCardCounterEntries', counters([10, 0, 3], [10, 1, 2])]] },
    'game.setAnnotation': { dialogs: ['Set annotation'] },
    'game.moveSelectedToLibraryBottom': { wire: [['moveCard', moveFromTable([10, 11], ZoneName.DECK, 0, true)]] },
    'game.cloneCard': {
      wire: [
        ['createToken', clone('Ogre', '3/3')],
        ['createToken', clone('Morph', '')],
      ],
    },
    'game.revealSelectedToAll': {},
    'game.tapCard': {
      wire: [
        [...attr(10, CardAttribute.AttrTapped, '1'), 'options'],
        [...attr(11, CardAttribute.AttrTapped, '1'), 'options'],
      ],
    },
    // Play acts on the hand selection; Ogre has no related tokens.
    'game.playCard': {},
    'game.playCardFaceDown': {},
    'game.createRelatedTokens': {},
    'game.moveSelectedToExile': { wire: [['moveCard', moveFromTable([10, 11], ZoneName.EXILE, 0, false)]] },
    'game.moveSelectedToHand': { wire: [['moveCard', moveFromTable([10, 11], ZoneName.HAND, 0, false)]] },
    'game.moveSelectedToLibraryTop': { wire: [['moveCard', moveFromTable([10, 11], ZoneName.DECK, 0, false)]] },
    'game.moveSelectedToBattlefield': { wire: [['moveCard', moveFromTable([10, 11], ZoneName.TABLE, 0, false)]] },
    // The zone views open as non-modal dialogs titled by zone and owner.
    'game.viewHand': { dialogs: ['ZoneLabel.title.hand — P1'] },
    'game.viewExile': { dialogs: ['ZoneLabel.title.rfg — P1'] },
    'game.sortHandByName': {},
    'game.sortHandByManaValue': {},
    'game.revealHandToAll': { wire: [['revealCards', { zoneName: ZoneName.HAND }]] },
    'game.revealRandomHandCardToAll': { wire: [['revealCards', { zoneName: ZoneName.HAND, cardId: [-2] }]] },
  };

  it.each(SEAT_SHORTCUT_ACTIONS.map((id) => [id]))('%s', async (id) => {
    const ogreWithC = makeCard({ ...OGRE, counterList: [{ ...OGRE.counterList[0], id: 2, value: 3 }] });
    const spec = id === 'game.removeCounterC'
      ? { ...SPEC, seats: [{ ...SPEC.seats[0], table: [ogreWithC, MORPH, WALL] }, SPEC.seats[1]] }
      : SPEC;
    const { game } = renderGame(spec);
    selectOgreAndMorph();
    if (id === 'game.createAnotherToken') {
      runShortcut('game.createToken');
      fireEvent.change(screen.getByLabelText('Token name'), { target: { value: 'Goblin' } });
      fireEvent.change(screen.getByLabelText('Token power/toughness'), { target: { value: '1/1' } });
      fireEvent.change(screen.getByLabelText('Token annotation'), { target: { value: 'ETB' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
      });
      expect(game.createToken).toHaveBeenCalledTimes(1);
      vi.clearAllMocks();
    }

    await act(async () => {
      expect(runShortcut(id)).toBe(true);
    });

    const expected = EXPECTED[id];
    expect({
      wire: wire(game),
      dialogs: dialogNames(),
      selected: selectedCards(),
    }).toEqual({
      wire: expected.wire ?? [],
      dialogs: expected.dialogs ?? [],
      selected: expected.selected ?? ['battlefield:10', 'battlefield:11'],
    });
  });

  it('covers every seat action', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...SEAT_SHORTCUT_ACTIONS].sort());
  });

  it('does nothing selection-scoped without a battlefield selection', () => {
    const { game } = renderGame();
    for (const id of ['game.flipCard', 'game.resetPT', 'game.incPT', 'game.cloneCard', 'game.addCounterA', 'game.attachCard'] as const) {
      runShortcut(id);
    }
    expect(wire(game)).toEqual([]);
  });

  it('increments every existing counter on the whole battlefield without a selection', () => {
    const { game } = renderGame();
    runShortcut('game.incrementAllCardCounters');
    expect(wire(game)).toEqual([['bulkSetCardCounterEntries', counters([10, 0, 3], [10, 1, 2])]]);
  });
});

function moveFromTable(cardIds: number[], targetZone: string, x: number, isReversed: boolean) {
  return {
    startPlayerId: 1,
    startZone: ZoneName.TABLE,
    cardsToMove: { card: cardIds.map((cardId) => ({ cardId })) },
    targetPlayerId: 1,
    targetZone,
    x,
    y: 0,
    isReversed,
  };
}

function counters(...entries: Array<[number, number, number]>) {
  return entries.map(([cardId, counterId, counterValue]) => ({ ownerPlayerId: 1, zone: ZoneName.TABLE, cardId, counterId, counterValue }));
}

/** One optimistic Command_SetCardAttr(AttrPT), with its rollback options. */
function setPT(cardId: number, pt: string) {
  return [...attr(cardId, CardAttribute.AttrPT, pt), 'options'];
}

function clone(name: string, pt: string, y = 0) {
  return { zone: ZoneName.TABLE, cardName: name, cardProviderId: '', color: '', pt, annotation: '', destroyOnZoneChange: true, x: -1, y };
}

describe('battlefield card menu actions', () => {
  // Right-click Ogre while Ogre and Morph are selected: every action applies
  // to the selection, and toggles follow the clicked card.
  const OWN: Array<[string[], { wire?: unknown[]; dialogs?: unknown[]; selected?: string[] }]> = [
    [['Tap / Untap'], {
      wire: [
        [...attr(10, CardAttribute.AttrTapped, '1'), 'options'],
        [...attr(11, CardAttribute.AttrTapped, '1'), 'options'],
      ],
    }],
    [['Skip untapping'], {
      wire: [attr(10, CardAttribute.AttrDoesntUntap, '1'), attr(11, CardAttribute.AttrDoesntUntap, '1')],
    }],
    [['Turn Over'], { wire: [['flipCard', { ...table(10), faceDown: true }], ['flipCard', { ...table(11), faceDown: true }]] }],
    [['Clone'], { wire: [['createToken', clone('Ogre', '3/3')], ['createToken', clone('Morph', '')]] }],
    [['Move to', 'Top of library in random order'], { wire: [['moveCard', moveFromTable([10, 11], ZoneName.DECK, 0, false)]] }],
    [['Move to', 'X cards from the top of library...'], { dialogs: ['Move X cards from the top of library'] }],
    [['Move to', 'Bottom of library in random order'], { wire: [['moveCard', moveFromTable([10, 11], ZoneName.DECK, 0, true)]] }],
    [['Move to', 'Table'], { wire: [['moveCard', moveFromTable([10, 11], ZoneName.TABLE, 0, false)]] }],
    [['Move to', 'Hand'], { wire: [['moveCard', moveFromTable([10, 11], ZoneName.HAND, 0, false)]] }],
    [['Move to', 'Graveyard'], { wire: [['moveCard', moveFromTable([10, 11], ZoneName.GRAVE, 0, false)]] }],
    [['Move to', 'Exile'], { wire: [['moveCard', moveFromTable([10, 11], ZoneName.EXILE, 0, false)]] }],
    [['Power / toughness', 'Increase power'], { wire: [setPT(10, '4/3'), setPT(11, '1/0')] }],
    [['Power / toughness', 'Decrease power'], { wire: [setPT(10, '2/3'), setPT(11, '-1/0')] }],
    [['Power / toughness', 'Increase power and decrease toughness'], { wire: [setPT(10, '4/2'), setPT(11, '1/-1')] }],
    [['Power / toughness', 'Increase toughness'], { wire: [setPT(10, '3/4'), setPT(11, '0/1')] }],
    [['Power / toughness', 'Decrease toughness'], { wire: [setPT(10, '3/2'), setPT(11, '0/-1')] }],
    [['Power / toughness', 'Decrease power and increase toughness'], { wire: [setPT(10, '2/4'), setPT(11, '-1/1')] }],
    [['Power / toughness', 'Increase power and toughness'], { wire: [setPT(10, '4/4'), setPT(11, '1/1')] }],
    [['Power / toughness', 'Decrease power and toughness'], { wire: [setPT(10, '2/2'), setPT(11, '-1/-1')] }],
    [['Power / toughness', 'Set power and toughness...'], { dialogs: ['Set power and toughness'] }],
    [['Power / toughness', 'Reset power and toughness'], { wire: [setPT(10, '')] }],
    [['Set annotation...'], { dialogs: ['Set annotation'] }],
    [['Reduce life by power'], { wire: [['incCounter', { counterId: LIFE_COUNTER_ID, delta: -3 }, 'options']] }],
    [['Select All'], { selected: ['battlefield:10', 'battlefield:11', 'battlefield:12'] }],
    [['Select Row'], { selected: ['battlefield:10', 'battlefield:11'] }],
    [['Card counters', 'Add counter (A)'], { wire: [['bulkSetCardCounterEntries', counters([10, 0, 3], [11, 0, 1])]] }],
    [['Card counters', 'Set counters (A)...'], { dialogs: ['Set counter A'] }],
    [['Card counters', 'Add counter (F)'], { wire: [['bulkSetCardCounterEntries', counters([10, 5, 1], [11, 5, 1])]] }],
  ];

  it.each(OWN)('%j', (path, expected) => {
    const { game } = renderGame();
    selectOgreAndMorph();
    openContextMenu(cardEl(OGRE.id, 'battlefield'));
    chooseMenuPath(...path);

    expect({ wire: wire(game), dialogs: dialogNames(), selected: selectedCards() }).toEqual({
      wire: expected.wire ?? [],
      dialogs: expected.dialogs ?? [],
      selected: expected.selected ?? ['battlefield:10', 'battlefield:11'],
    });
  });

  it('turns the selection face up from a face-down clicked card', () => {
    const { game } = renderGame();
    selectOgreAndMorph();
    openContextMenu(cardEl(MORPH.id, 'battlefield'));
    chooseMenuPath('Turn Over (face up)');
    expect(wire(game)).toEqual([['flipCard', { ...table(10), faceDown: false }], ['flipCard', { ...table(11), faceDown: false }]]);
  });

  it('clones a back-row card onto its own row', () => {
    const { game } = renderGame();
    openContextMenu(cardEl(WALL.id, 'battlefield'));
    chooseMenuPath('Clone');
    expect(wire(game)).toEqual([['createToken', { ...clone('Wall', '0/4', 2), annotation: 'note' }]]);
  });

  it('untaps the selection from a tapped clicked card', () => {
    const tapped = makeCard({ ...OGRE, tapped: true });
    const { game } = renderGame({ ...SPEC, seats: [{ ...SPEC.seats[0], table: [tapped, MORPH, WALL] }, SPEC.seats[1]] });
    selectOgreAndMorph();
    openContextMenu(cardEl(OGRE.id, 'battlefield'));
    chooseMenuPath('Tap / Untap');
    expect(wire(game)).toEqual([
      [...attr(10, CardAttribute.AttrTapped, '0'), 'options'],
      // Morph is already untapped: no optimistic change, so no rollback options.
      attr(11, CardAttribute.AttrTapped, '0'),
    ]);
  });

  it('acts on the clicked card alone when it is outside the selection', () => {
    const { game } = renderGame();
    selectOgreAndMorph();
    openContextMenu(cardEl(WALL.id, 'battlefield'));
    chooseMenuPath('Skip untapping');
    openContextMenu(cardEl(WALL.id, 'battlefield'));
    chooseMenuPath('Power / toughness', 'Increase power');
    expect(wire(game)).toEqual([attr(12, CardAttribute.AttrDoesntUntap, '0'), setPT(12, '1/4')]);
  });

  it('unattaches every selected card from an attached card\'s menu', () => {
    const attached = makeCard({ ...WALL, attachPlayerId: 1, attachZone: ZoneName.TABLE, attachCardId: 10 });
    const { game } = renderGame({
      ...SPEC,
      seats: [{ ...SPEC.seats[0], table: [OGRE, MORPH, attached] }, SPEC.seats[1]],
    });
    openContextMenu(cardEl(WALL.id, 'battlefield'));
    chooseMenuPath('Unattach');
    expect(wire(game)).toEqual([['attachCard', { startZone: ZoneName.TABLE, cardId: 12 }]]);
  });

  // The viewer's menu on the opponent's Bear.
  const OPPONENT: Array<[string, { wire?: unknown[]; selected?: string[] }]> = [
    ['Clone', { wire: [['createToken', clone('Bear', '2/2')]] }],
    ['Reduce life by power', { wire: [['incCounter', { counterId: LIFE_COUNTER_ID, delta: -2 }, 'options']] }],
    ['Select All', { selected: ['battlefield:20'] }],
    ['Select Row', { selected: ['battlefield:20'] }],
  ];

  it.each(OPPONENT)('opponent card: %s', (label, expected) => {
    const { game } = renderGame();
    openContextMenu(cardEl(BEAR.id, 'battlefield'));
    chooseMenuPath(label);
    expect({ wire: wire(game), selected: selectedCards() }).toEqual({
      wire: expected.wire ?? [],
      selected: expected.selected ?? [],
    });
  });
});

describe('arrows and attachments', () => {
  const COUNTERSPELL = makeCard({ id: 21, name: 'Counterspell' });
  const WITH_STACK: SeatGameSpec = {
    ...SPEC,
    seats: [SPEC.seats[0], { ...SPEC.seats[1], stack: [COUNTERSPELL] }],
  };

  const playerTarget = (playerId: number) =>
    document.querySelector<HTMLElement>(`[data-arrow-target-kind="player"][data-arrow-target-player-id="${playerId}"]`)!;

  // The fixture game is in its beginning phase, and "Do not delete arrows inside of subphases" is
  // on by default: every arrow is kept until the first main phase.
  const ARROW_LIFETIME = { deleteInPhase: Phase.FirstMain };
  const arrowTo = (startCardId: number, target: object, startZone: string = ZoneName.TABLE, arrowColor = ArrowColor.RED) =>
    ['createArrow', { startPlayerId: 1, startZone, startCardId, ...target, arrowColor, ...ARROW_LIFETIME }];

  describe('the menu\'s "Draw arrow..." pick', () => {
    it('draws a red arrow to the next card clicked, on any seat', () => {
      const { game } = renderGame();
      openContextMenu(cardEl(OGRE.id, 'battlefield'));
      chooseMenuPath('Draw arrow...');
      act(() => {
        fireEvent.click(cardEl(BEAR.id, 'battlefield'));
      });
      expect(wire(game)).toEqual([arrowTo(10, { targetPlayerId: 2, targetZone: ZoneName.TABLE, targetCardId: 20 })]);
    });

    it('sends the target card\'s own zone, as the right-button drag does', () => {
      const { game } = renderGame(WITH_STACK);
      openContextMenu(cardEl(OGRE.id, 'battlefield'));
      chooseMenuPath('Draw arrow...');
      act(() => {
        fireEvent.click(cardEl(COUNTERSPELL.id, 'stack'));
      });
      expect(wire(game)).toEqual([arrowTo(10, { targetPlayerId: 2, targetZone: ZoneName.STACK, targetCardId: 21 })]);
    });

    it('draws an arrow to a player, omitting the target card fields', () => {
      const { game } = renderGame();
      openContextMenu(cardEl(BEAR.id, 'battlefield'));
      chooseMenuPath('Draw arrow...');
      act(() => {
        fireEvent.click(playerTarget(1));
      });
      expect(wire(game)).toEqual([['createArrow', {
        startPlayerId: 2, startZone: ZoneName.TABLE, startCardId: 20, targetPlayerId: 1, arrowColor: ArrowColor.RED, ...ARROW_LIFETIME,
      }]]);
    });

    it('from a hand card plays the card, then draws the arrow from where it landed', async () => {
      const { game } = renderGame();
      openContextMenu(cardEl(SHOCK.id, 'hand'));
      chooseMenuPath('Draw arrow...');
      act(() => {
        fireEvent.click(cardEl(BEAR.id, 'battlefield'));
      });
      await vi.waitFor(() => {
        expect(game.moveCard).toHaveBeenCalled();
        expect(game.createArrow).toHaveBeenCalled();
      });
      expect(wire(game)).toEqual([
        ['moveCard', {
          startPlayerId: 1,
          startZone: ZoneName.HAND,
          cardsToMove: { card: [{ cardId: 30, faceDown: false }] },
          targetPlayerId: 1,
          // Desktop playCard(false): with playToStack on (the default), a
          // creature (tablerow 1) goes onto the stack.
          targetZone: ZoneName.STACK,
          x: 0,
          y: 0,
          isReversed: false,
        }],
        arrowTo(30, { targetPlayerId: 2, targetZone: ZoneName.TABLE, targetCardId: 20 }, ZoneName.STACK),
      ]);
    });

    it('holds one pick for the whole game: a pick from another seat replaces it', () => {
      const { game } = renderGame();
      openContextMenu(cardEl(OGRE.id, 'battlefield'));
      // An attach stays pending while the other seat's menu opens; an arrow
      // would be cancelled by the menu click before replacement was tested.
      chooseMenuPath('Attach to card...');
      openContextMenu(cardEl(BEAR.id, 'battlefield'));
      chooseMenuPath('Draw arrow...');
      act(() => {
        fireEvent.click(cardEl(WALL.id, 'battlefield'));
      });
      click(cardEl(WALL.id, 'battlefield'));
      expect(wire(game)).toEqual([['createArrow', {
        startPlayerId: 2, startZone: ZoneName.TABLE, startCardId: 20,
        targetPlayerId: 1, targetZone: ZoneName.TABLE, targetCardId: 12, arrowColor: ArrowColor.RED, ...ARROW_LIFETIME,
      }]]);
    });

    it('is cancelled by a card drag', () => {
      const { game } = renderGame();
      openContextMenu(cardEl(OGRE.id, 'battlefield'));
      chooseMenuPath('Draw arrow...');
      pointerDrag(cardEl(WALL.id, 'battlefield'), { x: 50, y: 50 }, { x: 90, y: 90 });
      act(() => {
        fireEvent.click(cardEl(BEAR.id, 'battlefield'));
      });
      expect(game.createArrow).not.toHaveBeenCalled();
    });

    it('targets a card with the source\'s id in another zone instead of cancelling', () => {
      const ECHO = makeCard({ id: OGRE.id, name: 'Echo' });
      const { game } = renderGame({ ...SPEC, seats: [{ ...SPEC.seats[0], grave: [ECHO] }, SPEC.seats[1]] });
      openContextMenu(pileEl('Graveyard', 0));
      chooseMenuPath('View graveyard');
      openContextMenu(cardEl(OGRE.id, 'battlefield'));
      chooseMenuPath('Draw arrow...');
      act(() => {
        fireEvent.click(document.querySelector(`[data-card-zone="${ZoneName.GRAVE}"][data-card-id="${ECHO.id}"]`)!);
      });
      expect(wire(game)).toEqual([arrowTo(10, { targetPlayerId: 1, targetZone: ZoneName.GRAVE, targetCardId: 10 })]);
    });

    it('with playToStack off, plays a hand card onto the battlefield with its printed P/T', async () => {
      vi.mocked(usePreference).mockImplementation(
        ((key: keyof typeof PREFERENCE_DEFAULTS) => (key === 'playToStack' ? false : PREFERENCE_DEFAULTS[key])) as typeof usePreference,
      );
      const { game } = renderGame();
      openContextMenu(cardEl(SHOCK.id, 'hand'));
      chooseMenuPath('Draw arrow...');
      act(() => {
        fireEvent.click(cardEl(BEAR.id, 'battlefield'));
      });
      await vi.waitFor(() => {
        expect(game.moveCard).toHaveBeenCalled();
        expect(game.createArrow).toHaveBeenCalled();
      });
      expect(wire(game)).toEqual([
        ['moveCard', {
          startPlayerId: 1,
          startZone: ZoneName.HAND,
          // The card database's printed P/T rides on the play (desktop playCard).
          cardsToMove: { card: [{ cardId: 30, faceDown: false, pt: '2/2' }] },
          targetPlayerId: 1,
          // A creature (tablerow 1) lands in the first free column of the middle row.
          targetZone: ZoneName.TABLE,
          x: 0,
          y: 1,
          isReversed: false,
        }],
        arrowTo(30, { targetPlayerId: 2, targetZone: ZoneName.TABLE, targetCardId: 20 }),
      ]);
    });

    it('targets a card in an open graveyard view', () => {
      const DURESS = makeCard({ id: 50, name: 'Duress' });
      const { game } = renderGame({ ...SPEC, seats: [{ ...SPEC.seats[0], grave: [DURESS] }, SPEC.seats[1]] });
      openContextMenu(pileEl('Graveyard', 0));
      chooseMenuPath('View graveyard');
      openContextMenu(cardEl(OGRE.id, 'battlefield'));
      chooseMenuPath('Draw arrow...');
      act(() => {
        fireEvent.click(cardEl(DURESS.id));
      });
      expect(wire(game)).toEqual([arrowTo(10, { targetPlayerId: 1, targetZone: ZoneName.GRAVE, targetCardId: 50 })]);
    });

    it('is cancelled by the source card, by empty space and by Escape', () => {
      const { game } = renderGame();
      for (const cancel of [
        () => fireEvent.click(cardEl(OGRE.id, 'battlefield')),
        () => fireEvent.click(document.body),
        () => fireEvent.keyDown(window, { key: 'Escape' }),
      ]) {
        openContextMenu(cardEl(OGRE.id, 'battlefield'));
        chooseMenuPath('Draw arrow...');
        act(cancel);
        act(() => {
          fireEvent.click(cardEl(BEAR.id, 'battlefield'));
        });
      }
      expect(wire(game)).toEqual([]);
    });

    it('the shortcut starts the same pick from the first selected card', () => {
      const { game } = renderGame();
      selectOgreAndMorph();
      runShortcut('game.drawArrow');
      act(() => {
        fireEvent.click(cardEl(BEAR.id, 'battlefield'));
      });
      expect(wire(game)).toEqual([arrowTo(10, { targetPlayerId: 2, targetZone: ZoneName.TABLE, targetCardId: 20 })]);
    });
  });

  describe('the menu\'s "Attach to card..." pick', () => {
    const attachTo = (cardId: number, targetCardId: number) =>
      ['attachCard', { startZone: ZoneName.TABLE, cardId, targetPlayerId: 1, targetZone: ZoneName.TABLE, targetCardId }];

    it('attaches every selected card to the next own battlefield card clicked', () => {
      const { game } = renderGame();
      selectOgreAndMorph();
      openContextMenu(cardEl(OGRE.id, 'battlefield'));
      chooseMenuPath('Attach to card...');
      click(cardEl(WALL.id, 'battlefield'));
      expect(wire(game)).toEqual([attachTo(10, 12), attachTo(11, 12)]);
    });

    it('the shortcut starts the same pick from the selection', () => {
      const { game } = renderGame();
      selectOgreAndMorph();
      runShortcut('game.attachCard');
      click(cardEl(WALL.id, 'battlefield'));
      expect(wire(game)).toEqual([attachTo(10, 12), attachTo(11, 12)]);
    });

    it('is cancelled by clicking its source card or Escape', () => {
      const { game } = renderGame();
      openContextMenu(cardEl(WALL.id, 'battlefield'));
      chooseMenuPath('Attach to card...');
      click(cardEl(WALL.id, 'battlefield'));
      click(cardEl(OGRE.id, 'battlefield'));
      openContextMenu(cardEl(WALL.id, 'battlefield'));
      chooseMenuPath('Attach to card...');
      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });
      click(cardEl(OGRE.id, 'battlefield'));
      expect(wire(game)).toEqual([]);
    });

    it('is not cancelled by a selected source card: a press on the selection starts a group drag', () => {
      const { game } = renderGame();
      selectOgreAndMorph();
      runShortcut('game.attachCard');
      click(cardEl(MORPH.id, 'battlefield'));
      click(cardEl(WALL.id, 'battlefield'));
      expect(wire(game)).toEqual([attachTo(10, 12), attachTo(11, 12)]);
    });
  });

  describe('the right-button drag', () => {
    afterEach(() => {
      delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    });

    type Modifiers = { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean };

    function rightDrag(source: HTMLElement, target: Element | null, modifiers: Modifiers = {}) {
      // jsdom has no layout, so no elementFromPoint: the hit test sees `target`.
      Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
      act(() => {
        fireEvent.mouseDown(source, { button: 2, clientX: 10, clientY: 10 });
      });
      act(() => {
        fireEvent.mouseMove(window, { clientX: 40, clientY: 40, ...modifiers });
      });
      act(() => {
        fireEvent.mouseUp(window, { button: 2, clientX: 40, clientY: 40, ...modifiers });
      });
    }

    it('draws an arrow to the card under the pointer, coloured by the held modifier', () => {
      const { game } = renderGame(WITH_STACK);
      rightDrag(cardEl(OGRE.id, 'battlefield'), cardEl(BEAR.id, 'battlefield'));
      rightDrag(cardEl(OGRE.id, 'battlefield'), cardEl(COUNTERSPELL.id, 'stack'), { ctrlKey: true });
      rightDrag(cardEl(OGRE.id, 'battlefield'), cardEl(BEAR.id, 'battlefield'), { altKey: true });
      rightDrag(cardEl(OGRE.id, 'battlefield'), cardEl(BEAR.id, 'battlefield'), { shiftKey: true });
      expect(wire(game)).toEqual([
        arrowTo(10, { targetPlayerId: 2, targetZone: ZoneName.TABLE, targetCardId: 20 }),
        arrowTo(10, { targetPlayerId: 2, targetZone: ZoneName.STACK, targetCardId: 21 }, ZoneName.TABLE, ArrowColor.YELLOW),
        arrowTo(10, { targetPlayerId: 2, targetZone: ZoneName.TABLE, targetCardId: 20 }, ZoneName.TABLE, ArrowColor.BLUE),
        arrowTo(10, { targetPlayerId: 2, targetZone: ZoneName.TABLE, targetCardId: 20 }, ZoneName.TABLE, ArrowColor.GREEN),
      ]);
    });

    it('draws an arrow to a player, and from an opponent\'s card', () => {
      const { game } = renderGame();
      rightDrag(cardEl(OGRE.id, 'battlefield'), playerTarget(2));
      rightDrag(cardEl(BEAR.id, 'battlefield'), cardEl(OGRE.id, 'battlefield'));
      expect(wire(game)).toEqual([
        arrowTo(10, { targetPlayerId: 2 }),
        ['createArrow', {
          startPlayerId: 2, startZone: ZoneName.TABLE, startCardId: 20,
          targetPlayerId: 1, targetZone: ZoneName.TABLE, targetCardId: 10, arrowColor: ArrowColor.RED, ...ARROW_LIFETIME,
        }],
      ]);
    });

    it('plays a hand card dragged out of the hand, then draws the arrow from where it landed', async () => {
      const { game } = renderGame();
      rightDrag(cardEl(SHOCK.id, 'hand'), cardEl(BEAR.id, 'battlefield'));
      await vi.waitFor(() => {
        expect(game.moveCard).toHaveBeenCalled();
        expect(game.createArrow).toHaveBeenCalled();
      });
      expect(wire(game)).toEqual([
        ['moveCard', expect.objectContaining({ startZone: ZoneName.HAND, targetZone: ZoneName.STACK })],
        arrowTo(30, { targetPlayerId: 2, targetZone: ZoneName.TABLE, targetCardId: 20 }, ZoneName.STACK),
      ]);
    });

    it('sends nothing for a drop on the source card or on nothing', () => {
      const { game } = renderGame();
      rightDrag(cardEl(OGRE.id, 'battlefield'), cardEl(OGRE.id, 'battlefield'));
      rightDrag(cardEl(OGRE.id, 'battlefield'), document.body);
      expect(wire(game)).toEqual([]);
    });
  });
});
