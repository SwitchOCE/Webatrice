import { useMemo, type ComponentProps } from 'react';

import type PlayerBox from '../../PlayerBox/PlayerBox';
import type { RoomMemberWithProfile } from '../../PlayerBox/mockTypes';
import type { PlayerBoardModel } from '../PlayerBoard/playerBoard.types';

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
