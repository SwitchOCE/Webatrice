import type { ZoneNameValue } from '@cockatrice/sockatrice';
import type { MoveCardParams } from '@cockatrice/sockatrice/generated';
import type {
  BattlefieldCardViewModel,
  PlayerBoardCommands,
  PlayerBoardModel,
  PlayerCardViewModel,
  RevealRecipient,
  RevealSelection,
} from './playerBoard.types';

// Type-level contract for the seat. Fixtures are typed against the model so a
// field rename or a widened port fails here before it reaches a view.

const card = (id: number, name: string): PlayerCardViewModel => ({ id: String(id), name, scryfallId: '' });

const opponentSeat = {
  seat: {
    playerId: 2,
    hydrated: true,
    isLocal: false,
    mirrored: true,
    isActive: false,
    displayName: 'Opp',
    username: 'Opp',
    avatarUrl: null,
    flipHandCardBacks: true,
    drawSeq: 0,
    lastDrawCount: 0,
    revealTargets: [{ playerId: 1, name: 'Me' }],
  },
  // Servatrice sends the deck list to its owner only.
  deck: [],
  zones: {
    // An opponent hand is a count only.
    hand: { cards: [], cardCount: 7 },
    library: { cardCount: 53, revealedCards: [], topCard: null, alwaysRevealTopCard: false, alwaysLookAtTopCard: false },
    graveyard: { cards: [card(40, 'Duress')], cardCount: 1 },
    exile: { cards: [], cardCount: 0 },
    stack: { cards: [], cardCount: 0 },
    battlefield: {
      cards: [
        { ...card(20, 'Bear'), ownerPlayerId: 2, slot: { row: 0, col: 0 }, subSlot: 0, tapped: false },
        // An aura owned by player 1 attached to Bear: rendered here, commanded as player 1.
        {
          ...card(21, 'Pacifism'),
          ownerPlayerId: 1,
          slot: { row: 0, col: 1 },
          subSlot: 0,
          tapped: false,
          attachTargetPlayerId: 2,
          attachTargetCardId: 20,
          counters: [{ id: 0, value: 2 }],
        },
      ],
    },
    sideboard: { cardCount: 15, revealedCards: [] },
  },
  counters: { life: { id: 1, value: 17 }, mana: { G: { id: 6, count: 0 } } },
  permissions: { isOwner: false, canAct: false },
} satisfies PlayerBoardModel;

describe('playerBoard.types', () => {
  it('models a seat with hidden counts, cross-player attachments and counters', () => {
    expectTypeOf(opponentSeat).toExtend<PlayerBoardModel>();
    expectTypeOf<PlayerBoardModel['zones']['library']['cardCount']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<BattlefieldCardViewModel>().toExtend<PlayerCardViewModel>();
    expectTypeOf<BattlefieldCardViewModel['ownerPlayerId']>().toEqualTypeOf<number | undefined>();
    expect(opponentSeat.zones.battlefield.cards.map((c) => c.ownerPlayerId)).toEqual([2, 1]);
  });

  it('groups commands into zone, card, counter and target ports', () => {
    expectTypeOf<keyof PlayerBoardCommands>().toEqualTypeOf<'zone' | 'card' | 'counter' | 'target'>();
    expectTypeOf<PlayerBoardCommands['zone']['move']>().parameter(0).toEqualTypeOf<MoveCardParams>();
    expectTypeOf<PlayerBoardCommands['zone']['reveal']>().parameters.toEqualTypeOf<
      [ZoneNameValue, RevealRecipient, RevealSelection?]
    >();
    // Peek is offered on the owner's seat only.
    expectTypeOf<PlayerBoardCommands['card']['peek']>().toEqualTypeOf<
      ((cardIds: readonly number[]) => void) | undefined
    >();
    expectTypeOf<PlayerBoardCommands['card']['createToken']>().returns.toEqualTypeOf<Promise<void>>();
  });
});
