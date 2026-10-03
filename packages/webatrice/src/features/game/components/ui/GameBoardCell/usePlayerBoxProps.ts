import { useMemo, type ComponentProps } from 'react';

import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';

import type PlayerBox from '../../PlayerBox/PlayerBox';
import type { RoomMemberWithProfile } from '../../PlayerBox/mockTypes';
import { ALL_PLAYERS } from '../../../dialogs/RevealCardsDialog/revealRecipient';
import type {
  PlayerBoardCommands,
  PlayerBoardModel,
  PlayerCounterViewModel,
  RevealRecipient,
} from '../PlayerBoard/playerBoard.types';

// Compatibility adapter: spreads the seat model back into PlayerBox's flat
// props so its JSX is unchanged while the model and command ports settle.
// Deleted once GameBoardCell renders PlayerBoard (refactor plan Phase 7/8);
// nothing but GameBoardCell may import it.

type PlayerBoxProps = ComponentProps<typeof PlayerBox>;

/** The state half of PlayerBox's props, read from the seat model. */
export function usePlayerBoxSeatProps(model: PlayerBoardModel) {
  const { seat, zones, counters } = model;

  const player = useMemo<RoomMemberWithProfile>(
    () => ({
      user_id: String(seat.playerId),
      profile: {
        id: String(seat.playerId),
        display_name: seat.displayName,
        username: seat.username,
        avatar_url: seat.avatarUrl,
      },
    }),
    [seat.playerId, seat.displayName, seat.username, seat.avatarUrl],
  );

  // Undefined until the player hydrates; PlayerBox then falls back to its own counts.
  const deckCount = zones.library.cardCount;
  const graveCount = zones.graveyard.cardCount;
  const exileCount = zones.exile.cardCount;
  const handCount = zones.hand.cardCount;
  const zoneCounts = useMemo(
    () => (seat.hydrated ? { deck: deckCount, grave: graveCount, rfg: exileCount, hand: handCount } : undefined),
    [seat.hydrated, deckCount, graveCount, exileCount, handCount],
  );

  return {
    player,
    isSelf: seat.isLocal,
    isActive: seat.isActive,
    handOnTop: seat.mirrored,
    flipHandCardBacks: seat.flipHandCardBacks,
    playerId: seat.playerId,
    zoneCounts,
    handCards: zones.hand.cards,
    graveCards: zones.graveyard.cards,
    exileCards: zones.exile.cards,
    stackCards: zones.stack.cards,
    battlefieldCards: zones.battlefield.cards,
    sideboardCards: zones.sideboard.revealedCards,
    revealedDeckCards: zones.library.revealedCards,
    deckTopCard: zones.library.topCard,
    alwaysRevealTopCard: zones.library.alwaysRevealTopCard,
    alwaysLookAtTopCard: zones.library.alwaysLookAtTopCard,
    revealTargets: seat.revealTargets,
    manaCounters: counters.mana,
    drawSeq: seat.drawSeq,
    lastDrawCount: seat.lastDrawCount,
  } satisfies Partial<PlayerBoxProps>;
}

/** PlayerBox's reveal target, with the dialogs' "All players" sentinel. */
const toRecipient = (targetPlayerId: number): RevealRecipient =>
  (targetPlayerId === ALL_PLAYERS ? 'all' : targetPlayerId);

/** The command half of PlayerBox's props, adapted from the grouped ports. */
export function usePlayerBoxCommandProps(
  commands: Partial<PlayerBoardCommands>,
  life: PlayerCounterViewModel['life'],
) {
  const { zone, card, counter, target } = commands;

  const zoneProps = useMemo(() => zone && ({
    onMoveCards: zone.moveCards,
    onDrawCards: zone.draw,
    onUndoDraw: zone.undoDraw,
    onMulligan: zone.mulligan,
    onShuffle: () => zone.shuffleLibrary(),
    onShuffleRange: (start: number, end: number) => zone.shuffleLibrary({ start, end }),
    onDumpTopCards: zone.viewLibrary,
    onClearRevealedDeck: zone.closeLibraryView,
    onDumpSideboard: zone.viewSideboard,
    onClearRevealedSideboard: zone.closeSideboardView,
    onRevealLibrary: (targetPlayerId: number) => zone.reveal(ZoneName.DECK, toRecipient(targetPlayerId)),
    onRevealZone: (zoneName: string, targetPlayerId: number) =>
      zone.reveal(zoneName as ZoneNameValue, toRecipient(targetPlayerId)),
    onRevealRandomFromZone: (zoneName: string, targetPlayerId: number) =>
      zone.reveal(zoneName as ZoneNameValue, toRecipient(targetPlayerId), 'random'),
    onRevealTopCards: (targetPlayerId: number, count: number) =>
      zone.reveal(ZoneName.DECK, toRecipient(targetPlayerId), { top: count }),
    onLendLibrary: zone.lendLibrary,
    onSetAlwaysRevealTopCard: zone.setAlwaysRevealTopCard,
    onSetAlwaysLookAtTopCard: zone.setAlwaysLookAtTopCard,
  }), [zone]);

  const cardProps = useMemo(() => card && ({
    onSetCardTapped: card.setTapped,
    onUntapAll: card.untapAll,
    onFlipCard: card.flip,
    onPeekCards: card.peek,
    onSetCardDoesntUntap: card.setDoesntUntap,
    onSetAnnotation: card.setAnnotation,
    onSetPT: card.setPT,
    onCloneCard: card.clone,
    onCreateToken: card.createToken,
  }), [card]);

  const counterProps = useMemo(() => counter && ({
    onModifyCounter: counter.increment,
    onSetPlayerCounter: counter.set,
    onSetCardCounter: counter.setCardCounter,
    onBulkSetCardCounters: counter.setCardCounters,
    onFlipCoin: counter.flipCoin,
  }), [counter]);

  const targetProps = useMemo(() => target && ({
    onAttachCard: target.attach,
    onUnattachCard: target.unattach,
    onCreateArrow: (
      sourceCardId: number,
      sourceZone: string,
      arrowTarget: Parameters<PlayerBoardCommands['target']['createArrow']>[2],
    ) => target.createArrow(sourceCardId, sourceZone as ZoneNameValue, arrowTarget),
    onClearOwnArrows: target.clearOwnArrows,
  }), [target]);

  // Life is the "life" counter: +/- sends a delta, the dialog an absolute value.
  const lifeId = life?.id;
  const lifeValue = life?.value;
  const lifeControl = useMemo(() => {
    if (!counter || lifeId == null || lifeValue == null) {
      return undefined;
    }
    return {
      value: lifeValue,
      onDelta: (delta: number) => counter.increment(lifeId, delta),
      onSet: (value: number) => counter.set(lifeId, value),
    };
  }, [counter, lifeId, lifeValue]);

  return { ...zoneProps, ...cardProps, ...counterProps, ...targetProps, lifeControl } satisfies Partial<PlayerBoxProps>;
}
