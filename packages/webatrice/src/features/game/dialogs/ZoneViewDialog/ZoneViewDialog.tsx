import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForkRef } from '@mui/material/utils';
import { ZoneName } from '@cockatrice/sockatrice';

import { usePreference } from '@app/hooks';

import { useCanActFor } from '../../components/ui/CardVisualStateContext';
import { useGameDialogsContext } from '../../components/ui/GameDialogsContext';
import { useGameId } from '../../components/ui/GameIdContext';
import { useGameSelectionState } from '../../components/ui/GameSelectionContext';
import { usePendingTargetContext } from '../../components/ui/PendingTargetContext';
import { useActiveSeatDrag, useSeatDragSource, useSeatDropZone } from '../../components/ui/SeatDragContext';
import type { ZoneViewTarget } from '../../hooks/dialogs/gameDialogs.types';
import {
  SEAT_DROP_PRIORITY,
  type SeatDragSource,
  type SeatDropPoint,
  type SeatDropTarget,
  type SeatZone,
} from '../../hooks/seatDropPlan';
import { makeCardKey } from '../../utils/CardRegistry/CardRegistryContext';
import { EMPTY_SELECTION } from '../../utils/selection';
import ZoneRevealPanel from './ZoneRevealPanel';
import ZoneViewPanel, { type ZoneViewCardScope } from './ZoneViewPanel';
import { useZoneViewDialog } from './useZoneViewDialog';
import { readShuffleOnClose } from '../shared/zoneViewPreferences';
import { isOrderedView, offersShuffleOnClose } from './zoneViewTarget';

export interface ZoneViewDialogProps {
  view: ZoneViewTarget;
  /** Closes the view; a whole-library view passes its "shuffle when closing" box. */
  handleClose: (shuffleOnClose?: boolean) => void;
}

/** The seat zone each wire zone a view can show is dragged from and dropped on. */
const SEAT_ZONE: Partial<Record<string, SeatZone>> = {
  [ZoneName.DECK]: 'library',
  [ZoneName.GRAVE]: 'graveyard',
  [ZoneName.EXILE]: 'exile',
  [ZoneName.HAND]: 'hand',
  [ZoneName.SIDEBOARD]: 'sideboard',
};

/** The card menu each zone's view cards get, rendered by the owning seat:
 *  graveyard and exile cards desktop's zone-view menu (Draw arrow, Clone,
 *  Select All, Select Column), library and sideboard cards its
 *  hand-or-custom-zone menu (Play, Reveal to..., Move to, ...). */
const CARD_MENU_KIND: Partial<Record<string, 'pile' | 'zoneView'>> = {
  [ZoneName.GRAVE]: 'pile',
  [ZoneName.EXILE]: 'pile',
  [ZoneName.DECK]: 'zoneView',
  [ZoneName.SIDEBOARD]: 'zoneView',
};

/**
 * One zone view (desktop ZoneViewWidget), stacked by Game from the game
 * dialog state's `zoneViews`. A whole zone lists through ZoneViewPanel
 * (search, sort, group, pile view); a top / bottom N library view lists its
 * cards in server order through ZoneRevealPanel.
 *
 * The view owns its seat DnD surface: the local player drags cards out of
 * their own zone, and a drop on the view lands in the zone it shows. Its card
 * selection is the game's (useGameSelection), keyed like every other card.
 */
function ZoneViewDialog({ view, handleClose }: ZoneViewDialogProps) {
  const gameId = useGameId();
  const { playerId, zoneName } = view;
  const { cards, count, title, isLocal } = useZoneViewDialog(gameId, view);
  const ordered = isOrderedView(view);
  const seatZone = SEAT_ZONE[zoneName];

  // "Close card view window when last card is removed" (desktop ViewZoneLogic): close once the
  // view goes from showing cards to showing none, not when it opens on an empty zone. A
  // whole-library view closes through its "shuffle when closing" choice, as closing by hand does.
  // Game keys views by seat and zone, so a top N view replacing a library view reuses this
  // instance: the count is tracked per view so the replacement opening empty is not a removal.
  const closeEmptyCardView = usePreference('closeEmptyCardView');
  const viewKey = `${view.numberCards ?? -1}:${view.isReversed ?? false}`;
  const shown = useRef({ viewKey, count: cards.length });
  useEffect(() => {
    const previous = shown.current;
    shown.current = { viewKey, count: cards.length };
    if (closeEmptyCardView && previous.viewKey === viewKey && previous.count > 0 && cards.length === 0) {
      handleClose(offersShuffleOnClose(view) && readShuffleOnClose());
    }
  }, [cards.length, closeEmptyCardView, handleClose, view, viewKey]);

  // Desktop starts a drag only on the local player's cards
  // (CardItem::mouseMoveEvent); another player's view is read-only.
  const canActFor = useCanActFor();
  const viewId = `zone-view-${playerId}-${zoneName}`;
  const startDrag = useSeatDragSource(viewId, {
    seatPlayerId: playerId,
    zone: seatZone ?? 'library',
    canMoveFor: canActFor,
    disabled: !isLocal || seatZone == null,
  });
  const onCardPointerDown = isLocal && seatZone != null
    ? (e: React.PointerEvent<HTMLElement>, card: { id: string }) => startDrag(e, [card])
    : undefined;

  const activeDrag = useActiveSeatDrag();
  const draggingCardIds = activeDrag?.seatPlayerId === playerId && activeDrag.zone === seatZone
    ? new Set(activeDrag.cards.map((c) => c.id))
    : undefined;

  // A drop on the view lands in the zone it shows, so a drop back on it is a
  // same-zone no-op. The hand view appends (it sorts and groups, so a
  // positional insert wouldn't match what the user sees), except for a hand
  // card dropped back on it: that append would send it to the end of the
  // hand, so the drop resolves to no target and the card snaps back. The
  // sideboard is hidden and appends too. A top / bottom N view inserts
  // between two of its cards (past a card's centre means after it), at the
  // deck position that slot shows: slot k is position k from the top, or
  // deckCount - N + k.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const resolveDrop = ({ pointer }: SeatDropPoint, source: SeatDragSource): SeatDropTarget | null => {
    switch (seatZone) {
      case 'hand':
        return source.zone === 'hand' ? null : { zone: 'hand', index: cards.length };
      case 'graveyard':
      case 'exile':
      case 'sideboard':
        return { zone: seatZone };
      case 'library':
        if (!ordered) {
          return { zone: 'library' };
        }
        break;
      default:
        return null;
    }
    let slot = 0;
    let best = Infinity;
    panelRef.current?.querySelectorAll<HTMLElement>('[data-card][data-card-id]').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = (pointer.x - cx) ** 2 + (pointer.y - cy) ** 2;
      if (dist < best) {
        best = dist;
        slot = pointer.x > cx ? i + 1 : i;
      }
    });
    const base = view.isReversed ? count - cards.length : 0;
    return { zone: 'library', position: Math.max(0, Math.min(count, base + slot)) };
  };
  const dropRef = useSeatDropZone(
    viewId,
    { seatPlayerId: playerId, priority: dropPriority(view), resolve: resolveDrop },
    seatZone == null,
  );
  const panelDropRef = useForkRef(panelRef, dropRef);

  const { selectedIds, setSelectedIds } = useZoneViewSelection(playerId, zoneName, cards);

  const { openSeatCardMenu } = useGameDialogsContext();
  // Enter on a card while an arrow pick is pending takes it, by the click rule.
  const { pending, pickArrowAt, cancel: cancelPick } = usePendingTargetContext();
  const cardMenuKind = CARD_MENU_KIND[zoneName];
  const onCardContextMenu = cardMenuKind
    ? (at: { x: number; y: number }, card: { id: string; name: string }, scope: ZoneViewCardScope) => {
      openSeatCardMenu({
        kind: cardMenuKind,
        playerId,
        zone: zoneName,
        cardId: card.id,
        cardName: card.name,
        x: at.x,
        y: at.y,
        viewCardIds: scope.shownIds,
        columnCardIds: scope.columnIds,
      });
    }
    : undefined;

  if (ordered) {
    return (
      <ZoneRevealPanel
        title={title}
        cards={cards}
        // The snapshot's ids are deck positions (the reveal reindex,
        // view_zone_logic.cpp); the ends read "Top" / "Bottom".
        labels={cards.map((c) => {
          const libraryPos = Number(c.id);
          if (!Number.isFinite(libraryPos)) {
            return '';
          }
          if (libraryPos <= 0) {
            return 'Top';
          }
          if (libraryPos >= count - 1) {
            return 'Bottom';
          }
          return String(libraryPos);
        })}
        onCardPointerDown={onCardPointerDown}
        dropRef={panelDropRef}
        draggingCardIds={draggingCardIds}
        onClose={() => handleClose(false)}
      />
    );
  }

  return (
    <ZoneViewPanel
      title={title}
      library={cards}
      showShuffleOnClose={offersShuffleOnClose(view)}
      onClose={handleClose}
      onCardPointerDown={onCardPointerDown}
      onCardContextMenu={onCardContextMenu}
      onCardActivate={(_card, element) => pickArrowAt(element)}
      onEscapeCancel={() => {
        if (!pending) {
          return false;
        }
        cancelPick();
        return true;
      }}
      dropRef={panelDropRef}
      draggingCardIds={draggingCardIds}
      selectedIds={selectedIds}
      onSelectedIdsChange={setSelectedIds}
      cardOwner={{ playerId, zone: zoneName }}
    />
  );
}

/** Views float over the board and take drops before it; the order among
 *  them is the one PlayerBox hit-tested its dialogs in. */
function dropPriority(view: ZoneViewTarget): number {
  switch (view.zoneName) {
    case ZoneName.DECK:
      return isOrderedView(view) ? SEAT_DROP_PRIORITY.revealDialog : SEAT_DROP_PRIORITY.librarySearchDialog;
    case ZoneName.SIDEBOARD:
      return SEAT_DROP_PRIORITY.sideboardDialog;
    default:
      return SEAT_DROP_PRIORITY.pileViewDialog;
  }
}

/**
 * The view's share of the game selection, as the ids its cards carry. A new
 * set replaces the game selection; closing the view drops its cards from it.
 * Outside a game (isolated renders) the view keeps a selection of its own.
 */
function useZoneViewSelection(playerId: number, zoneName: string, cards: readonly { id: string }[]) {
  const game = useGameSelectionState();
  const [localKeys, setLocalKeys] = useState<ReadonlySet<string>>(EMPTY_SELECTION);
  const selectedCardKeys = game?.selectedCardKeys ?? localKeys;
  const setSelectedCardKeys = game?.setSelectedCardKeys ?? setLocalKeys;

  const keyOf = useCallback((id: string) => makeCardKey(playerId, zoneName, Number(id)), [playerId, zoneName]);
  const selectedIds = useMemo(
    () => new Set(cards.filter((c) => selectedCardKeys.has(keyOf(c.id))).map((c) => c.id)),
    [cards, selectedCardKeys, keyOf],
  );
  const setSelectedIds = useCallback(
    (ids: ReadonlySet<string>) => {
      setSelectedCardKeys(ids.size === 0 ? EMPTY_SELECTION : new Set([...ids].map(keyOf)));
    },
    [setSelectedCardKeys, keyOf],
  );

  const shownKeys = useRef<string[]>([]);
  shownKeys.current = cards.map((c) => keyOf(c.id));
  useEffect(
    () => () => {
      const shown = new Set(shownKeys.current);
      setSelectedCardKeys((prev) => {
        if (![...prev].some((key) => shown.has(key))) {
          return prev;
        }
        const kept = new Set([...prev].filter((key) => !shown.has(key)));
        return kept.size === 0 ? EMPTY_SELECTION : kept;
      });
    },
    [setSelectedCardKeys],
  );

  return { selectedIds, setSelectedIds };
}

export default ZoneViewDialog;
