import type { Dispatch, SetStateAction } from 'react';
import { ZoneName } from '@cockatrice/sockatrice';
import { usePreference } from '@app/hooks';
import { lookupCard } from '@app/services';

import type { SeatSelection } from '../../../hooks/useSeatSelection';
import { playCardMove } from '../../context-menus/CardContextMenu/handCardMenu.actions';
import type {
  BattlefieldCardViewModel,
  PlayerCardCommands,
  PlayerCardViewModel,
  PlayerZoneCommands,
} from './playerBoard.types';
import { seatCardMetaFromLookup, type SeatCardMeta } from './useSeatCardMetadata';

/** The seat zones a click (or double-click) plays from. */
export type ClickToPlayZone = 'hand' | 'stack' | 'battlefield';

/** The modifier keys desktop reads on a click to play. */
export interface ClickModifiers {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Desktop skips the play only when Alt is the one modifier held (`modifiers() != AltModifier`). */
function isAltOnly({ shiftKey, altKey, ctrlKey, metaKey }: ClickModifiers): boolean {
  return altKey && !shiftKey && !ctrlKey && !metaKey;
}

interface UseSeatClickToPlayArgs {
  /** Whether the local client may act for the seat's player: its own seat, or any seat for a
   *  judge (desktop's CardItem::playCard, getLocalOrJudge). */
  canAct: boolean;
  selection: SeatSelection | null;
  handDisplayList: readonly PlayerCardViewModel[];
  stackDisplayList: readonly PlayerCardViewModel[];
  battlefieldDisplayList: readonly BattlefieldCardViewModel[];
  cardMetaByName: ReadonlyMap<string, SeatCardMeta>;
  setCardMetaByName: Dispatch<SetStateAction<Map<string, SeatCardMeta>>>;
  zoneCommands: PlayerZoneCommands;
  cardCommands: PlayerCardCommands;
}

/**
 * What a click on one of the seat's cards plays: a port of desktop's CardItem::handleClickedToPlay
 * and PlayerActions::playCard.
 *
 * - "Double-click cards to play them" (on by default) picks the gesture: a double-click, or a
 *   single click (a press released without dragging). Alt on its own never plays, as on desktop;
 *   only the seat's player or a judge plays.
 * - On the battlefield it taps or untaps the clicked card, or the whole selection when the card is
 *   in it (TableZone::toggleTapped: tap all unless every one is already tapped).
 * - Anywhere else it plays the card: from the hand, a land goes to the battlefield, an instant or
 *   sorcery to the stack, any other permanent to the stack with "Play all nonlands onto the
 *   stack" (else the battlefield); from the stack, an instant or sorcery resolves to the graveyard
 *   and anything else to the battlefield, as the card menu's playCardMove sends it (printed P/T and
 *   cipt included). Shift plays it face down onto the battlefield.
 * - "Clicking plays all selected cards" (on by default) plays every selected card of the zone when
 *   the clicked card is among them, in desktop's order (highest card id first).
 */
export function useSeatClickToPlay({
  canAct,
  selection,
  handDisplayList,
  stackDisplayList,
  battlefieldDisplayList,
  cardMetaByName,
  setCardMetaByName,
  zoneCommands,
  cardCommands,
}: UseSeatClickToPlayArgs) {
  const doubleClickToPlay = usePreference('doubleClickToPlay');
  const clickPlaysAllSelected = usePreference('clickPlaysAllSelected');
  const playToStack = usePreference('playToStack');

  // The card's metadata from the prefetched cache; on a miss, a fresh lookup (cached for next
  // time) so the first click routes correctly even before the prefetch lands.
  const metaOf = async (name: string): Promise<SeatCardMeta> => {
    const cached = cardMetaByName.get(name);
    if (cached?.typeLine) {
      return cached;
    }
    const meta = seatCardMetaFromLookup(await lookupCard(name));
    if (meta.typeLine || meta.pt) {
      setCardMetaByName((prev) => {
        if (prev.get(name)?.typeLine) {
          return prev;
        }
        const next = new Map(prev);
        next.set(name, { ...prev.get(name), ...meta });
        return next;
      });
    }
    return { ...cached, ...meta };
  };

  const playCard = async (zone: 'hand' | 'stack', card: PlayerCardViewModel, faceDown: boolean) => {
    const cardId = Number(card.id);
    if (!Number.isFinite(cardId)) {
      return;
    }
    const from = zone === 'hand' ? ZoneName.HAND : ZoneName.STACK;
    // A face-down play needs no type line: it always lands in row 2.
    const meta = faceDown ? undefined : await metaOf(card.name);
    const play = playCardMove(cardId, meta, { faceDown, playToStack: zone === 'hand' && playToStack, fromStack: zone === 'stack' });
    zoneCommands.moveCards(from, [play.card], play.to);
  };

  // The clicked card, or the zone's whole selection when the card is in it.
  const targetsOf = <T extends PlayerCardViewModel>(
    zone: ClickToPlayZone,
    card: T,
    zoneCards: readonly T[],
    selected: SeatSelection | null,
  ): T[] =>
      selected?.zone === zone && selected.ids.has(card.id)
        ? zoneCards.filter((c) => selected.ids.has(c.id))
        : [card];

  const toggleTapped = (card: BattlefieldCardViewModel, selected: SeatSelection | null) => {
    const targets = targetsOf('battlefield', card, battlefieldDisplayList, selected);
    const tapAll = targets.some((c) => !c.tapped);
    const ids = targets
      .filter((c) => c.tapped !== tapAll)
      .map((c) => Number(c.id))
      .filter(Number.isFinite);
    if (ids.length > 0) {
      cardCommands.setTapped(ids, tapAll);
    }
  };

  // `selected` is the selection the click acts on: as it was before the click, for a single click.
  const clickToPlay = async (
    zone: ClickToPlayZone,
    card: PlayerCardViewModel,
    modifiers: ClickModifiers,
    selected: SeatSelection | null,
  ) => {
    if (!canAct || isAltOnly(modifiers)) {
      return;
    }
    if (zone === 'battlefield') {
      const onTable = battlefieldDisplayList.find((c) => c.id === card.id);
      if (onTable) {
        toggleTapped(onTable, selected);
      }
      return;
    }
    const zoneCards = zone === 'hand' ? handDisplayList : stackDisplayList;
    const targets = targetsOf(zone, card, zoneCards, clickPlaysAllSelected ? selected : null)
      .sort((a, b) => Number(b.id) - Number(a.id));
    for (const target of targets) {
      await playCard(zone, target, modifiers.shiftKey);
    }
  };

  return {
    doubleClickToPlay,
    /** A card's double-click: plays it when double-click is the gesture. */
    onCardDoubleClick: (zone: ClickToPlayZone, card: PlayerCardViewModel, e: ClickModifiers) => {
      if (doubleClickToPlay) {
        void clickToPlay(zone, card, e, selection);
      }
    },
    /**
     * A press released on a card without dragging: plays it when single-click is the gesture.
     * The release has already updated the selection, so the caller hands over the one from
     * before the click (what desktop's playSelected reads).
     */
    onCardClick: (
      zone: ClickToPlayZone,
      card: PlayerCardViewModel,
      e: ClickModifiers,
      selectionBefore: SeatSelection | null,
    ) => {
      if (!doubleClickToPlay) {
        void clickToPlay(zone, card, e, selectionBefore);
      }
    },
  };
}
