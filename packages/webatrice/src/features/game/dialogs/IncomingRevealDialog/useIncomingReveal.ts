import { useCallback, useMemo } from 'react';

import { games } from '@cockatrice/datatrice';
import { useAppDispatch, useAppSelector } from '@app/store';

type HandCard = { id: string; name: string; scryfallId: string };

/**
 * The pending incoming reveal (Event_RevealCards sent to us) and what the
 * receiver may do with it. Desktop opens a ZoneViewWidget when the event
 * arrives with cards; the viewer sees the source player's cards until they
 * close it. The source does not get this view (the server sends them the
 * summary event instead).
 */
export function useIncomingReveal() {
  const reveal = useAppSelector(games.Selectors.getIncomingReveal);
  const dispatch = useAppDispatch();

  const sourceName = useAppSelector((state) =>
    reveal
      ? games.Selectors.getPlayer(state, reveal.gameId, reveal.sourceOwnerId)?.properties.userInfo?.name
      : undefined,
  );

  // The source zone's live snapshot, not the event's payload: the
  // cardsRevealed listener seeds it, so a card moved out of the zone (a lend
  // recipient taking one to hand) leaves it through zoneViewCardRemoved. An
  // emptied snapshot is truthful and lists no cards, as does a missing one
  // (the selector answers an empty list for both).
  const liveCards = useAppSelector((state) =>
    reveal ? games.Selectors.getRevealedCards(state, reveal.gameId, reveal.sourceOwnerId, reveal.zoneName) : undefined,
  );
  const cards = useMemo<HandCard[]>(
    () => (liveCards ?? []).map((c, i) => ({ id: String(c.id ?? i), name: c.name, scryfallId: c.providerId })),
    [liveCards],
  );

  // Our seat in the game: the receiving side of a move out of a lent zone.
  const localPlayerId = useAppSelector((state) =>
    reveal ? games.Selectors.getLocalPlayerId(state, reveal.gameId) : undefined,
  );
  const isSpectator = useAppSelector((state) => (reveal ? games.Selectors.isSpectator(state, reveal.gameId) : false));

  // With write access granted, the cards drag onto a battlefield, as from
  // desktop's ZoneViewWidget for a lent zone. Servatrice's cmdMoveCard checks
  // the write-permission set (server_abstract_player.cpp:779). Only a seated
  // player other than the lender: a lend never targets a spectator, and a
  // self-directed reveal is the player's own library view.
  const canDragLent =
    reveal != null &&
    reveal.grantWriteAccess &&
    localPlayerId != null &&
    !isSpectator &&
    reveal.sourceOwnerId !== localPlayerId;

  // Closing also clears the source's revealedCards on our client, so a later
  // "View library" of that player (after a reset, in another game) cannot see
  // a stale snapshot. The cardsRevealed listener seeds it again on the next reveal.
  const close = useCallback(() => {
    if (reveal) {
      dispatch(games.Actions.zoneViewCleared({
        gameId: reveal.gameId,
        playerId: reveal.sourceOwnerId,
        zoneName: reveal.zoneName,
      }));
    }
    dispatch(games.Actions.incomingRevealDismissed());
  }, [dispatch, reveal]);

  return { reveal, sourceName, cards, localPlayerId, canDragLent, close };
}
