import { useEffect, useRef, useState } from 'react';
import type { ZoneNameValue } from '@cockatrice/sockatrice';

import type { PlayerTargetCommands } from './playerBoard.types';

export interface UsePendingArrowsArgs {
  /** The seat's player: the owner of the source cards. */
  playerId: number;
  targetCommands: PlayerTargetCommands;
}

/**
 * The seat's menu-started target picks: "Attach to card..." (resolved by the
 * next click on one of this seat's battlefield cards) and "Draw arrow..."
 * (resolved by the next click on any card or player). Escape or a click on
 * nothing cancels either; the pointer is tracked meanwhile so the seat can
 * draw the live arrow.
 */
export function usePendingArrows({ playerId, targetCommands }: UsePendingArrowsArgs) {
  // Pending-attach source: set when the user selects "Attach to card..."
  // from a battlefield card's context menu. Next click on a battlefield
  // card resolves the attach; Escape or clicking the source cancels.
  // Numeric `cardId` because Command_AttachCard needs the wire id, not
  // the string HandCard id. Only set on the isSelf PlayerBox (opponents
  // can't attach FROM their own cards via our UI). The ref is kept in
  // sync so the drag/pointerup useEffect closure — which captures
  // `drag` and only re-registers when it changes — can still read the
  // latest pending state without needing pending in its deps.
  const [attachPending, setAttachPending] = useState<
    { sourceCardId: number; sourceCardName: string } | null
  >(null);
  // Companion snapshot for multi-attach — Cockatrice attaches every
  // selected card to the target on completion. `attachPending` still
  // carries the visual anchor (single source id + arrow ring); this
  // holds the additional sources that also attach when the target is
  // clicked. Cleared alongside `attachPending`.
  const [attachExtraSourceIds, setAttachExtraSourceIds] = useState<readonly number[]>([]);
  const attachPendingRef = useRef(attachPending);
  const attachExtraSourceIdsRef = useRef(attachExtraSourceIds);
  useEffect(() => {
    attachPendingRef.current = attachPending;
  }, [attachPending]);
  useEffect(() => {
    attachExtraSourceIdsRef.current = attachExtraSourceIds;
  }, [attachExtraSourceIds]);
  // Pending draw-arrow — same shape as attachPending. Menu → set →
  // next battlefield card OR player-target click resolves. Rendered
  // as a live RED arrow following the cursor (Cockatrice's `Qt::red`
  // default for `actDrawArrow`).
  const [drawArrowPending, setDrawArrowPending] = useState<
    {
      sourceCardId: number;
      sourceCardName: string;
      /** Wire zone name of the source card. Defaults to TABLE (battlefield
       *  arrows), set to GRAVE / EXILE when the flow started from a
       *  pile-view modal's card context menu. Passed through to
       *  `targetCommands.createArrow` so the wire's `startZone` matches where the
       *  source card actually lives — arrows drawn from a grave card
       *  render off the grave pile at both ends' clients. */
      sourceZone: ZoneNameValue;
    } | null
  >(null);
  // Window-level click resolver for the draw-arrow flow. Unlike attach
  // (which can only target this player's own board), draw-arrow can
  // target ANY player's battlefield card OR any life-pill hitbox. Uses
  // capture-phase click on window so it fires before per-card handlers,
  // and hit-tests via data attributes. Set up only while pending.
  useEffect(() => {
    if (!drawArrowPending || playerId == null) {
      return undefined;
    }
    const onClick = (e: MouseEvent) => {
      // Only respond to LEFT clicks. Right-clicks are the drag-arrow
      // system; middle/other buttons are ignored.
      if (e.button !== 0) {
        return;
      }
      const source = drawArrowPending;
      const el = e.target instanceof Element ? e.target : null;
      if (!el) {
        return;
      }
      // Card hit-test first: closest [data-card-id] with matching
      // owner/zone data attrs (same attrs the right-click-drag hook
      // uses). If found, target the card.
      const cardEl = el.closest('[data-card-id][data-card-owner][data-card-zone]') as HTMLElement | null;
      if (cardEl) {
        const targetPlayerId = Number(cardEl.getAttribute('data-card-owner'));
        const targetCardId = Number(cardEl.getAttribute('data-card-id'));
        if (
          Number.isFinite(targetPlayerId) &&
          Number.isFinite(targetCardId) &&
          !(targetPlayerId === playerId && targetCardId === source.sourceCardId)
        ) {
          e.preventDefault();
          e.stopPropagation();
          targetCommands.createArrow(source.sourceCardId, source.sourceZone, {
            kind: 'card',
            playerId: targetPlayerId,
            cardId: targetCardId,
          });
          setDrawArrowPending(null);
          return;
        }
        // Same-card click = cancel. Match Cockatrice's `targetItem == startItem`
        // short-circuit in `ArrowDragItem::mouseReleaseEvent`.
        if (targetPlayerId === playerId && targetCardId === source.sourceCardId) {
          e.preventDefault();
          e.stopPropagation();
          setDrawArrowPending(null);
          return;
        }
      }
      // Player-target hit-test.
      const playerEl = el.closest('[data-arrow-target-kind="player"]') as HTMLElement | null;
      if (playerEl) {
        const targetPlayerId = Number(playerEl.getAttribute('data-arrow-target-player-id'));
        if (Number.isFinite(targetPlayerId)) {
          e.preventDefault();
          e.stopPropagation();
          targetCommands.createArrow(source.sourceCardId, source.sourceZone, {
            kind: 'player',
            playerId: targetPlayerId,
          });
          setDrawArrowPending(null);
          return;
        }
      }
      // Click on empty space or non-target UI → cancel.
      setDrawArrowPending(null);
    };
    // Capture phase so we run before React's delegated handlers on the
    // battlefield cards (which would otherwise fire selection / other
    // click effects even after we set the pending state to null).
    window.addEventListener('click', onClick, { capture: true });
    return () => window.removeEventListener('click', onClick, { capture: true });
  }, [drawArrowPending, playerId, targetCommands]);
  // Escape cancels any menu-initiated pending flow (attach or draw
  // arrow). Kept on window so it fires regardless of what's focused.
  useEffect(() => {
    if (!attachPending && !drawArrowPending) {
      return undefined;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setAttachPending(null);
        setDrawArrowPending(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attachPending, drawArrowPending]);

  // Live pointer position — tracked while EITHER menu-initiated
  // arrow flow is pending so we can draw the arrow from the source
  // card to the cursor. Cleared when both flows end so the arrow
  // stops following. Cockatrice uses a mouse-grabbed ArrowAttachItem
  // / ArrowDragItem for the same visual (arrow_item.cpp:177+, 288+);
  // we render an SVG portal instead.
  const [pendingArrowPointer, setPendingArrowPointer] = useState<{
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (!attachPending && !drawArrowPending) {
      setPendingArrowPointer(null);
      return undefined;
    }
    const onMove = (e: MouseEvent) => {
      setPendingArrowPointer({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [attachPending, drawArrowPending]);

  return {
    attachPending,
    setAttachPending,
    attachExtraSourceIds,
    setAttachExtraSourceIds,
    attachPendingRef,
    attachExtraSourceIdsRef,
    drawArrowPending,
    setDrawArrowPending,
    pendingArrowPointer,
  };
}
