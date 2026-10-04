import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ZoneName } from '@cockatrice/sockatrice';
import { games } from '@cockatrice/datatrice';

import { useAppSelector } from '@app/store';

import {
  revealedCardsToSeatCards,
  seatDisplayName,
  zoneToSeatCards,
} from '../../components/ui/GameBoardCell/usePlayerSeatViewModel';
import type { PlayerCardViewModel } from '../../components/ui/PlayerBoard/playerBoard.types';
import type { ZoneViewTarget } from '../../hooks/dialogs/gameDialogs.types';
import { zoneLabel } from '../shared/zoneLabels';
import { isHiddenZone, isOrderedView } from './zoneViewTarget';

export interface ZoneViewData {
  /** The cards the view lists, as the seat renders them. A hidden zone's ids
   *  are deck positions (its Response_DumpZone snapshot). */
  cards: PlayerCardViewModel[];
  /** The zone's real size (`cardCount`), which a hidden zone's snapshot may not cover. */
  count: number;
  title: string;
  /** Whether the view shows the local player's own zone. */
  isLocal: boolean;
}

/** The header of a view: "P1's library", "Top 3 cards — P1", "Graveyard — P1". */
export function zoneViewTitle(t: TFunction, view: ZoneViewTarget, playerName: string, shownCount: number): string {
  if (view.zoneName === ZoneName.DECK) {
    return isOrderedView(view)
      ? `${view.isReversed ? 'Bottom' : 'Top'} ${shownCount} cards — ${playerName}`
      : `${playerName}'s library`;
  }
  return `${zoneLabel(t, view.zoneName)} — ${playerName}`;
}

/** What one zone view shows, read from the game state. */
export function useZoneViewDialog(gameId: number | undefined, view: ZoneViewTarget): ZoneViewData {
  const { t } = useTranslation();
  const { playerId, zoneName } = view;
  const zone = useAppSelector((state) =>
    gameId != null ? games.Selectors.getZone(state, gameId, playerId, zoneName) : undefined,
  );
  const realName = useAppSelector((state) =>
    gameId != null ? games.Selectors.getPlayer(state, gameId, playerId)?.properties.userInfo?.name : undefined,
  );
  const localPlayerId = useAppSelector((state) =>
    gameId != null ? games.Selectors.getLocalPlayerId(state, gameId) : undefined,
  );
  const isLocal = playerId === localPlayerId;

  const cards = useMemo(
    () => (isHiddenZone(zoneName) ? revealedCardsToSeatCards(zone?.revealedCards) : zoneToSeatCards(zone)),
    [zoneName, zone],
  );
  const count = zone?.cardCount ?? cards.length;
  const title = zoneViewTitle(t, view, seatDisplayName(realName, isLocal, playerId), cards.length);

  return { cards, count, title, isLocal };
}
