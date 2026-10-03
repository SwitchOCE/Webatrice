// Characterization of GameBoardCell as the seat adapter (refactor plan Phase 0).
//
// GameBoardCell selects Datatrice state, projects it into the PlayerBox props and
// builds the command callbacks PlayerBox fires. PlayerBox is replaced by a probe
// that records its props, so these specs pin (a) the state projection and (b) the
// exact Sockatrice request each callback sends, including the optimistic Redux
// dispatches and rollbacks. Phase 3 moves both halves into usePlayerSeatViewModel /
// usePlayerZoneCommands; these expectations are the contract they must keep.

import { act } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { CardAttribute, Command_CreateToken_TargetMode } from '@cockatrice/sockatrice/generated';
import { makeArrow, makeCard } from '@cockatrice/datatrice/testing';
import { ArrowColor } from '@app/types';
import { CardDTO, takeStagedDeck } from '@app/services';
import { createMockWebClient, renderWithProviders } from '../../../../../__test-utils__';
import { buildSeatGameState, LIFE_COUNTER_ID, MANA_COUNTER_IDS, type SeatGameSpec } from '../../../__test-utils__/seatFixtures';
import type { BoardCell } from '../../../hooks/useGameBoardLayout';
import GameBoardCell from './GameBoardCell';

const probe = vi.hoisted(() => ({ props: undefined as Record<string, any> | undefined }));

vi.mock('../../PlayerBox/PlayerBox', () => ({
  default: (props: Record<string, unknown>) => {
    probe.props = props;
    return null;
  },
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const BOLT = makeCard({ id: 10, name: 'Bolt', providerId: 'bolt-pid', x: 4, y: 1, counterList: [] });
const OGRE = makeCard({ id: 11, name: 'Ogre', x: 0, y: 0, tapped: true, pt: '3/3', annotation: 'big' });
const SHOCK = makeCard({ id: 30, name: 'Shock', providerId: 'shock-pid' });
const SPELL = makeCard({ id: 50, name: 'Counterspell', annotation: 'targets Bolt' });
const DURESS = makeCard({ id: 40, name: 'Duress' });
const BEAR = makeCard({ id: 20, name: 'Bear', x: 0, y: 0 });
// Opponent-owned aura attached to Bolt: lives in P2's TABLE, renders under P1.
const AURA = makeCard({ id: 21, name: 'Pacifism', x: 3, y: 0, attachPlayerId: 1, attachZone: ZoneName.TABLE, attachCardId: 10 });

const DECK_XML = `<?xml version="1.0"?>
<cockatrice_deck version="1">
  <deckname>Burn</deckname>
  <zone name="main"><card number="4" name="Bolt"/></zone>
</cockatrice_deck>`;

const SPEC: SeatGameSpec = {
  localPlayerId: 1,
  activePlayerId: 1,
  seats: [
    {
      playerId: 1,
      table: [BOLT, OGRE],
      hand: [SHOCK],
      grave: [DURESS],
      stack: [SPELL],
      deckCount: 40,
      sideboardCount: 15,
      deckList: DECK_XML,
    },
    { playerId: 2, name: 'Opp', table: [BEAR, AURA], handCount: 5, deckCount: 33, life: 17 },
  ],
};

const OWN_CELL: BoardCell = { playerId: 1, isLocal: true, mirrored: false, canAct: true, showHand: true, row: 1, col: 0 };
const OPP_CELL: BoardCell = { playerId: 2, isLocal: false, mirrored: true, canAct: false, showHand: false, row: 0, col: 0 };

function renderCell(cell: BoardCell = OWN_CELL, { spec = SPEC, totalPlayers = 2, mutate }: {
  spec?: SeatGameSpec;
  totalPlayers?: number;
  mutate?: (state: ReturnType<typeof buildSeatGameState>) => void;
} = {}) {
  const preloadedState = buildSeatGameState(spec);
  mutate?.(preloadedState);
  const webClient = createMockWebClient();
  const utils = renderWithProviders(<GameBoardCell cell={cell} totalPlayers={totalPlayers} />, { preloadedState, webClient });
  return { ...utils, game: webClient.request.game, session: webClient.request.session, props: () => probe.props! };
}

const zone = (store: ReturnType<typeof renderCell>['store'], playerId: number, name: string) =>
  store.getState().games.games[1].players[playerId].zones[name];

beforeEach(() => {
  probe.props = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GameBoardCell — state projection into the seat', () => {
  it('projects identity, turn, layout flags and the life counter', () => {
    const { props } = renderCell();

    expect(props().player).toMatchObject({ user_id: '1', profile: { id: '1', display_name: 'P1', username: 'P1' } });
    expect(props()).toMatchObject({ isSelf: true, isActive: true, handOnTop: false, flipHandCardBacks: true, playerId: 1 });
    expect(props().lifeControl.value).toBe(20);
    expect(props().revealTargets).toEqual([{ playerId: 2, name: 'Opp' }]);
    expect(props().manaCounters).toEqual({
      W: { id: MANA_COUNTER_IDS.w, count: 0 },
      U: { id: MANA_COUNTER_IDS.u, count: 0 },
      B: { id: MANA_COUNTER_IDS.b, count: 0 },
      R: { id: MANA_COUNTER_IDS.r, count: 0 },
      G: { id: MANA_COUNTER_IDS.g, count: 0 },
      C: { id: MANA_COUNTER_IDS.x, count: 0 },
      O: { id: MANA_COUNTER_IDS.storm, count: 0 },
    });
  });

  it('keeps opponent card backs upright only in three-player layouts', () => {
    expect(renderCell(OPP_CELL, { totalPlayers: 3 }).props()).toMatchObject({
      isSelf: false,
      isActive: false,
      handOnTop: true,
      flipHandCardBacks: false,
    });
  });

  it('takes hidden-zone counts from cardCount and keeps the opponent hand secret', () => {
    const own = renderCell().props();
    expect(own.zoneCounts).toEqual({ deck: 40, grave: 1, rfg: 0, hand: 1 });
    expect(own.handCards).toEqual([{ id: '30', name: 'Shock', scryfallId: 'shock-pid', annotation: undefined }]);

    const opp = renderCell(OPP_CELL).props();
    expect(opp.zoneCounts).toEqual({ deck: 33, grave: 0, rfg: 0, hand: 5 });
    expect(opp.handCards).toEqual([]);
    expect(opp.lifeControl.value).toBe(17);
  });

  it('projects piles bottom → top and keeps annotations for the stack', () => {
    const { props } = renderCell();
    expect(props().graveCards).toEqual([{ id: '40', name: 'Duress', scryfallId: '', annotation: undefined }]);
    expect(props().exileCards).toEqual([]);
    expect(props().stackCards).toEqual([{ id: '50', name: 'Counterspell', scryfallId: '', annotation: 'targets Bolt' }]);
  });

  it('unpacks the wire x into stack column and sub-slot', () => {
    const own = renderCell().props().battlefieldCards;
    expect(own.find((c: { id: string }) => c.id === '10')).toMatchObject({
      ownerPlayerId: 1,
      slot: { row: 1, col: 1 },
      subSlot: 1,
      tapped: false,
      attachTargetCardId: undefined,
    });
    expect(own.find((c: { id: string }) => c.id === '11')).toMatchObject({
      slot: { row: 0, col: 0 },
      subSlot: 0,
      tapped: true,
      pt: '3/3',
      annotation: 'big',
    });
  });

  it('renders a cross-player attachment under its parent while keeping the true owner', () => {
    const ownIds = renderCell().props().battlefieldCards.map((c: { id: string; ownerPlayerId: number }) => [c.id, c.ownerPlayerId]);
    expect(ownIds).toEqual([['10', 1], ['11', 1], ['21', 2]]);
    const aura = probe.props!.battlefieldCards.find((c: { id: string }) => c.id === '21');
    expect(aura).toMatchObject({ attachTargetCardId: 10, attachTargetPlayerId: 1 });

    const oppIds = renderCell(OPP_CELL).props().battlefieldCards.map((c: { id: string }) => c.id);
    expect(oppIds).toEqual(['20']);
  });

  it('projects revealed library / sideboard snapshots and the known top card', () => {
    const { props } = renderCell(OWN_CELL, {
      mutate: (state) => {
        const zones = state.games!.games![1]!.players![1]!.zones!;
        zones[ZoneName.DECK]!.revealedCards = [makeCard({ id: 0, name: 'Top' }), makeCard({ id: 1, name: 'Next' })];
        zones[ZoneName.DECK]!.topRevealedCard = makeCard({ id: 0, name: 'Top', providerId: 'top-pid' });
        zones[ZoneName.DECK]!.alwaysRevealTopCard = true;
        zones[ZoneName.SIDEBOARD]!.revealedCards = [makeCard({ id: 0, name: 'Side' })];
      },
    });
    expect(props().revealedDeckCards).toEqual([
      { id: '0', name: 'Top', scryfallId: '' },
      { id: '1', name: 'Next', scryfallId: '' },
    ]);
    expect(props().deckTopCard).toEqual({ name: 'Top', scryfallId: 'top-pid' });
    expect(props().alwaysRevealTopCard).toBe(true);
    expect(props().alwaysLookAtTopCard).toBe(false);
    expect(props().sideboardCards).toEqual([{ id: '0', name: 'Side', scryfallId: '' }]);
  });

  it('falls back to placeholder identity and no controlled state before the player hydrates', () => {
    const { props } = renderCell({ ...OPP_CELL, playerId: 9 });
    expect(props().player.profile.display_name).toBe('Player 9');
    expect(props().lifeControl).toBeUndefined();
    expect(props().zoneCounts).toBeUndefined();
  });
});

describe('GameBoardCell — deck editor link (Cockatrice deck document)', () => {
  it('opens the deck being played as an unsaved draft, with no stored-deck lookup', () => {
    const { props, session } = renderCell(OWN_CELL);
    act(() => props().onOpenDeckInEditor());

    expect(session.deckList).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
    const [path] = navigate.mock.calls[0] as [string];
    const token = path.match(/^\/deck\/draft\/(.+)$/)?.[1];
    expect(token).toBeDefined();
    expect(takeStagedDeck(decodeURIComponent(token!))).toBe(DECK_XML);
  });

  it('offers no link for an opponent or a seat whose deck is not known yet', () => {
    expect(renderCell(OPP_CELL).props().onOpenDeckInEditor).toBeUndefined();
    expect(
      renderCell(OWN_CELL, {
        spec: { ...SPEC, seats: [{ ...SPEC.seats[0], deckList: '' }, SPEC.seats[1]] },
      }).props().onOpenDeckInEditor,
    ).toBeUndefined();
  });
});

describe('GameBoardCell — move command adapter', () => {
  it('sends hidden-zone moves straight to the server without an optimistic dispatch', () => {
    const { props, game, store } = renderCell();
    act(() => props().onMoveCards(ZoneName.DECK, [0], { zone: ZoneName.HAND }));

    expect(game.moveCard).toHaveBeenCalledWith(1, {
      startPlayerId: 1,
      startZone: ZoneName.DECK,
      cardsToMove: { card: [{ cardId: 0 }] },
      targetPlayerId: 1,
      targetZone: ZoneName.HAND,
      x: 0,
      y: 0,
    });
    expect(zone(store, 1, ZoneName.HAND).order).toEqual([30]);
  });

  it('moves a public card optimistically and rolls back when the server rejects', () => {
    const { props, game, store } = renderCell();
    const params = {
      startPlayerId: 1,
      startZone: ZoneName.HAND,
      cardsToMove: { card: [{ cardId: 30 }] },
      targetPlayerId: 1,
      targetZone: ZoneName.GRAVE,
      x: 0,
      y: 0,
    };
    act(() => props().onMoveCards(ZoneName.HAND, [30], { zone: ZoneName.GRAVE }));

    expect(zone(store, 1, ZoneName.GRAVE).order).toEqual([40, 30]);
    expect(zone(store, 1, ZoneName.HAND).order).toEqual([]);
    expect(game.moveCard).toHaveBeenCalledWith(1, params, undefined, { onError: expect.any(Function) });

    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    act(() => vi.mocked(game.moveCard).mock.calls[0][3]!.onError!(1, {} as never));
    expect(zone(store, 1, ZoneName.HAND).order).toEqual([30]);
    expect(zone(store, 1, ZoneName.GRAVE).order).toEqual([40]);
  });

  it('resolves a table drop to the next free sub-slot, walking right then left when the stack is full', () => {
    const fullColumn = [0, 1, 2].map((sub) => makeCard({ id: 60 + sub, name: `S${sub}`, x: 3 + sub, y: 0 }));
    const { props, game } = renderCell(OWN_CELL, {
      spec: { ...SPEC, seats: [{ ...SPEC.seats[0], table: [...fullColumn, makeCard({ id: 64, name: 'R', x: 6, y: 0 })] }, SPEC.seats[1]] },
    });
    act(() => props().onMoveCards(ZoneName.DECK, [0], { zone: ZoneName.TABLE, index: 3 }));
    // Column 1 is full; column 2 has sub-slot 0 taken → x = 2 * 3 + 1.
    expect(vi.mocked(game.moveCard).mock.calls[0][1]).toMatchObject({ x: 7, y: 0 });
  });
});

describe('GameBoardCell — library, zone and reveal commands', () => {
  it('draw, mulligan, undo draw and shuffles', () => {
    const { props, game } = renderCell();
    props().onDrawCards(3);
    props().onMulligan(6);
    props().onUndoDraw();
    props().onShuffle();
    props().onShuffleRange(0, 2);
    props().onShuffleRange(-3, -1);

    expect(game.drawCards).toHaveBeenCalledWith(1, { number: 3 });
    expect(game.mulligan).toHaveBeenCalledWith(1, { number: 6 });
    expect(game.undoDraw).toHaveBeenCalledWith(1);
    expect(vi.mocked(game.shuffle).mock.calls.map(([, p]) => p)).toEqual([
      { zoneName: ZoneName.DECK, start: 0, end: -1 },
      { zoneName: ZoneName.DECK, start: 0, end: 2 },
      { zoneName: ZoneName.DECK, start: -3, end: -1 },
    ]);
  });

  it('dumps and clears library / sideboard views', () => {
    const { props, game, store } = renderCell(OWN_CELL, {
      mutate: (state) => {
        state.games!.games![1]!.players![1]!.zones![ZoneName.DECK]!.revealedCards = [makeCard({ id: 0 })];
        state.games!.games![1]!.players![1]!.zones![ZoneName.SIDEBOARD]!.revealedCards = [makeCard({ id: 0 })];
      },
    });
    props().onDumpTopCards(5, true);
    props().onDumpSideboard();
    expect(vi.mocked(game.dumpZone).mock.calls.map(([, p]) => p)).toEqual([
      { playerId: 1, zoneName: ZoneName.DECK, numberCards: 5, isReversed: true },
      { playerId: 1, zoneName: ZoneName.SIDEBOARD, numberCards: -1, isReversed: false },
    ]);

    act(() => props().onClearRevealedDeck());
    act(() => props().onClearRevealedSideboard());
    expect(zone(store, 1, ZoneName.DECK).revealedCards ?? []).toEqual([]);
    expect(zone(store, 1, ZoneName.SIDEBOARD).revealedCards ?? []).toEqual([]);
  });

  it('reveal commands omit playerId for "all players" and use the desktop sentinels', () => {
    const { props, game } = renderCell();
    props().onRevealLibrary(-1);
    props().onRevealLibrary(2);
    props().onLendLibrary(2);
    props().onRevealZone(ZoneName.HAND, -1);
    props().onRevealRandomFromZone(ZoneName.GRAVE, 2);
    props().onRevealTopCards(-1, 3);
    props().onRevealTopCards(2, 1);
    props().onRevealCards(ZoneName.HAND, -1, [4, 9]);
    props().onRevealCards(ZoneName.DECK, 2, [11]);

    expect(vi.mocked(game.revealCards).mock.calls.map(([, p]) => p)).toEqual([
      { zoneName: ZoneName.DECK },
      { zoneName: ZoneName.DECK, playerId: 2 },
      { zoneName: ZoneName.DECK, playerId: 2, grantWriteAccess: true },
      { zoneName: ZoneName.HAND },
      { zoneName: ZoneName.GRAVE, cardId: [-2], playerId: 2 },
      { zoneName: ZoneName.DECK, topCards: 3, cardId: [0] },
      { zoneName: ZoneName.DECK, topCards: 1, cardId: [0], playerId: 2 },
      { zoneName: ZoneName.HAND, cardId: [4, 9] },
      { zoneName: ZoneName.DECK, cardId: [11], playerId: 2 },
    ]);
  });

  it('always-reveal / always-look toggles change the deck zone properties', () => {
    const { props, game } = renderCell();
    props().onSetAlwaysRevealTopCard(true);
    props().onSetAlwaysLookAtTopCard(false);
    expect(vi.mocked(game.changeZoneProperties).mock.calls.map(([, p]) => p)).toEqual([
      { zoneName: ZoneName.DECK, alwaysRevealTopCard: true },
      { zoneName: ZoneName.DECK, alwaysLookAtTopCard: false },
    ]);
  });
});

describe('GameBoardCell — card commands', () => {
  it('taps optimistically per card, skips the optimistic step when already in state, and rolls back on error', () => {
    const { props, game, store } = renderCell();
    act(() => props().onSetCardTapped([10, 11], true));

    expect(zone(store, 1, ZoneName.TABLE).byId[10].tapped).toBe(true);
    const calls = vi.mocked(game.setCardAttr).mock.calls;
    expect(calls.map(([, p]) => p)).toEqual([
      { zone: ZoneName.TABLE, cardId: 10, attribute: CardAttribute.AttrTapped, attrValue: '1' },
      { zone: ZoneName.TABLE, cardId: 11, attribute: CardAttribute.AttrTapped, attrValue: '1' },
    ]);
    // Only the card whose state changed carries a rollback.
    expect(calls[0][3]).toEqual({ onError: expect.any(Function) });
    expect(calls[1]).toHaveLength(2);

    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    act(() => calls[0][3]!.onError!(1, {} as never));
    expect(zone(store, 1, ZoneName.TABLE).byId[10].tapped).toBe(false);
  });

  it('untap all, flip, doesn\'t-untap, annotation and P/T', () => {
    const { props, game, store } = renderCell();
    props().onUntapAll();
    props().onFlipCard(10, true);
    props().onSetCardDoesntUntap(10, true);
    props().onSetAnnotation(10, 'note');
    act(() => props().onSetPT([{ cardId: 11, pt: '4/4' }]));

    const attr = (cardId: number, attribute: CardAttribute, attrValue: string) => ({ zone: ZoneName.TABLE, cardId, attribute, attrValue });
    expect(game.setCardAttr).toHaveBeenCalledWith(1, attr(-1, CardAttribute.AttrTapped, '0'));
    expect(game.flipCard).toHaveBeenCalledWith(1, { zone: ZoneName.TABLE, cardId: 10, faceDown: true });
    expect(game.setCardAttr).toHaveBeenCalledWith(1, attr(10, CardAttribute.AttrDoesntUntap, '1'));
    expect(game.setCardAttr).toHaveBeenCalledWith(1, attr(10, CardAttribute.AttrAnnotation, 'note'));
    expect(game.setCardAttr).toHaveBeenCalledWith(
      1,
      { zone: ZoneName.TABLE, cardId: 11, attribute: CardAttribute.AttrPT, attrValue: '4/4' },
      undefined,
      { onError: expect.any(Function) },
    );
    expect(zone(store, 1, ZoneName.TABLE).byId[11].pt).toBe('4/4');
  });

  it('card counters: single set is clamped and optimistic; bulk set is one batch', () => {
    const { props, game, store } = renderCell();
    act(() => props().onSetCardCounter(10, 2, 3));
    act(() => props().onSetCardCounter(10, 3, -4));
    props().onBulkSetCardCounters([{ cardId: 10, counterId: 2, value: 4 }, { cardId: 11, counterId: 0, value: 1 }]);
    props().onBulkSetCardCounters([]);

    expect(vi.mocked(game.setCardCounter).mock.calls.map(([, p]) => p)).toEqual([
      { zone: ZoneName.TABLE, cardId: 10, counterId: 2, counterValue: 3 },
      { zone: ZoneName.TABLE, cardId: 10, counterId: 3, counterValue: 0 },
    ]);
    expect(zone(store, 1, ZoneName.TABLE).byId[10].counterList.map((c) => [c.id, c.value])).toEqual([[2, 3]]);
    expect(game.bulkSetCardCounterEntries).toHaveBeenCalledTimes(1);
    expect(game.bulkSetCardCounterEntries).toHaveBeenCalledWith(1, [
      { ownerPlayerId: 1, zone: ZoneName.TABLE, cardId: 10, counterId: 2, counterValue: 4 },
      { ownerPlayerId: 1, zone: ZoneName.TABLE, cardId: 11, counterId: 0, counterValue: 1 },
    ]);
  });

  it('attach sends the target; unattach omits every target field', () => {
    const { props, game } = renderCell();
    props().onAttachCard(10, { playerId: 2, cardId: 20 });
    props().onUnattachCard(10);

    const [attach, unattach] = vi.mocked(game.attachCard).mock.calls.map(([, p]) => p);
    expect(attach).toEqual({ startZone: ZoneName.TABLE, cardId: 10, targetPlayerId: 2, targetZone: ZoneName.TABLE, targetCardId: 20 });
    expect(unattach).toEqual({ startZone: ZoneName.TABLE, cardId: 10 });
  });

  it('arrows: card targets carry zone + card, player targets omit them; Ctrl+R clears own arrows', () => {
    const { props, game } = renderCell(OWN_CELL, {
      mutate: (state) => {
        state.games!.games![1]!.players![1]!.arrows = { 5: makeArrow({ id: 5 }), 6: makeArrow({ id: 6 }) };
      },
    });
    props().onCreateArrow(10, ZoneName.TABLE, { kind: 'card', playerId: 2, cardId: 20 });
    props().onCreateArrow(40, ZoneName.GRAVE, { kind: 'player', playerId: 2 });
    props().onClearOwnArrows();

    expect(vi.mocked(game.createArrow).mock.calls.map(([, p]) => p)).toEqual([
      {
        startPlayerId: 1,
        startZone: ZoneName.TABLE,
        startCardId: 10,
        targetPlayerId: 2,
        arrowColor: ArrowColor.RED,
        targetZone: ZoneName.TABLE,
        targetCardId: 20,
      },
      { startPlayerId: 1, startZone: ZoneName.GRAVE, startCardId: 40, targetPlayerId: 2, arrowColor: ArrowColor.RED },
    ]);
    expect(vi.mocked(game.deleteArrow).mock.calls.map(([, p]) => p)).toEqual([{ arrowId: 5 }, { arrowId: 6 }]);
  });

  it('peek is local-seat only and batches through bulkPeek', () => {
    const { props, game } = renderCell();
    props().onPeekCards([10, 11]);
    props().onPeekCards([]);
    expect(game.bulkPeek).toHaveBeenCalledTimes(1);
    expect(game.bulkPeek).toHaveBeenCalledWith(
      1,
      [
        { ownerPlayerId: 1, zone: ZoneName.TABLE, card: { id: 10 } },
        { ownerPlayerId: 1, zone: ZoneName.TABLE, card: { id: 11 } },
      ],
      1,
    );
    expect(renderCell(OPP_CELL).props().onPeekCards).toBeUndefined();
  });

  it('clone creates a destroy-on-zone-change token on the source row', () => {
    const { props, game } = renderCell();
    props().onCloneCard({ name: 'Ogre', providerId: 'p', color: 'r', pt: '3/3', annotation: 'big', y: 2 });
    expect(game.createToken).toHaveBeenCalledWith(1, {
      zone: ZoneName.TABLE,
      cardName: 'Ogre',
      cardProviderId: 'p',
      color: 'r',
      pt: '3/3',
      annotation: 'big',
      destroyOnZoneChange: true,
      x: -1,
      y: 2,
    });
  });

  it('create token picks the row from the card database table row; face-down and transform variants', async () => {
    const tablerows: Record<string, string> = { Forest: '0', Wall: '3' };
    vi.spyOn(CardDTO, 'get').mockImplementation(((name: string) =>
      Promise.resolve(tablerows[name] ? { tablerow: { value: tablerows[name] } } : undefined)) as unknown as typeof CardDTO.get);
    const { props, game } = renderCell();
    const base = { color: '', pt: '', annotation: '', destroyOnZoneChange: true, faceDown: false };

    await act(async () => {
      await props().onCreateToken({ ...base, name: 'Forest' });
      await props().onCreateToken({ ...base, name: 'Wall' });
      await props().onCreateToken({ ...base, name: 'Unknown' });
      await props().onCreateToken({ ...base, name: 'Forest', faceDown: true });
      await props().onCreateToken({ ...base, name: 'Back', providerId: 'b', targetCardId: 10, targetMode: 'transform_into' });
    });

    const calls = vi.mocked(game.createToken).mock.calls.map(([, p]) => p);
    expect(calls.map((p) => [p.cardName, p.y, p.faceDown])).toEqual([
      ['Forest', 2, false],
      ['Wall', 1, false],
      ['Unknown', 0, false],
      ['Forest', 0, true],
      ['Back', 0, false],
    ]);
    expect(calls[0]).toMatchObject({ zone: ZoneName.TABLE, x: -1, cardProviderId: '' });
    expect(calls[0]).not.toHaveProperty('targetMode');
    expect(calls[4]).toMatchObject({
      cardProviderId: 'b',
      targetZone: ZoneName.TABLE,
      targetCardId: 10,
      targetMode: Command_CreateToken_TargetMode.TRANSFORM_INTO,
    });
  });
});

describe('GameBoardCell — player counters', () => {
  it('life and mana counters update optimistically and roll back on error', () => {
    const { props, game, store } = renderCell();
    const count = (id: number) => store.getState().games.games[1].players[1].counters[id].count;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    act(() => props().lifeControl.onDelta(-3));
    expect(count(LIFE_COUNTER_ID)).toBe(17);
    expect(game.incCounter).toHaveBeenLastCalledWith(1, { counterId: LIFE_COUNTER_ID, delta: -3 }, { onError: expect.any(Function) });
    act(() => vi.mocked(game.incCounter).mock.calls.at(-1)![2]!.onError!(1, {} as never));
    expect(count(LIFE_COUNTER_ID)).toBe(20);

    act(() => props().lifeControl.onSet(5));
    expect(count(LIFE_COUNTER_ID)).toBe(5);
    expect(game.setCounter).toHaveBeenLastCalledWith(1, { counterId: LIFE_COUNTER_ID, value: 5 }, { onError: expect.any(Function) });

    act(() => props().onModifyCounter(MANA_COUNTER_IDS.g, 2));
    expect(count(MANA_COUNTER_IDS.g)).toBe(2);
    act(() => props().onSetPlayerCounter(MANA_COUNTER_IDS.r, 4));
    expect(count(MANA_COUNTER_IDS.r)).toBe(4);
    expect(game.setCounter).toHaveBeenLastCalledWith(1, { counterId: MANA_COUNTER_IDS.r, value: 4 }, { onError: expect.any(Function) });
  });

  it('flip coin is a single d2 roll', () => {
    const { props, game } = renderCell();
    props().onFlipCoin();
    expect(game.rollDie).toHaveBeenCalledWith(1, { sides: 2, count: 1 });
  });
});

describe('GameBoardCell — no active game', () => {
  it('provides no commands while the game id is unknown', () => {
    const preloadedState = buildSeatGameState(SPEC);
    renderWithProviders(<GameBoardCell cell={OWN_CELL} totalPlayers={2} />, { preloadedState, gameId: undefined });
    const commandProps = Object.entries(probe.props!).filter(([key]) => key.startsWith('on'));
    expect(commandProps.filter(([, value]) => value !== undefined).map(([key]) => key)).toEqual([]);
  });
});
