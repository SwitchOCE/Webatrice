import { forwardRef, useRef, useState, type HTMLAttributes, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Skull, Sparkles } from 'lucide-react';
import { ScryfallImageSize } from '@cockatrice/datatrice';
import { ZoneName } from '@cockatrice/sockatrice';
import { CardImage, isContextMenuKey, type MenuAnchor } from '@app/components';
import { getScryfallUrlByIdOrExactName } from '@app/services';

import { ContextMenuPopup, contextMenuAnchor, type ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import { useCardPreviewActions } from '../CardPreviewContext';
import type { PlayerCardViewModel } from '../PlayerBoard/playerBoard.types';
import { usePlayerSeatContext } from '../PlayerBoard/PlayerSeatContext';
import {
  CARD_BACK_URL,
  CARD_CORNER_RADIUS,
  CARD_HEIGHT,
  CARD_SIDEWAYS_HEIGHT,
  CARD_SIDEWAYS_WIDTH,
  CARD_WIDTH,
} from '../SeatCard/cardSize';
import Card from '../SeatCard/SeatCard';
import { GAME_FOCUS_RING } from '../focusRing';
import { OVER_ART_SHADOW } from '../seatColors/seatColors';

/** Synthetic drag payload for pulling the top of the library. The library
 *  is a HiddenZone — the client never knows which face is at deck[0]
 *  (that's the server's shuffle) so the drag carries no identity. The id
 *  is a non-numeric sentinel, which planSeatMove sends as position 0, the
 *  top of the deck (Cockatrice's HiddenZone convention). */
const LIBRARY_TOP_DRAG_PAYLOAD: PlayerCardViewModel = {
  id: '__library_top__',
  name: '',
  scryfallId: '',
};

/**
 * Full-size zone box matching the Library footprint but WITHOUT the card back
 * image — for zones like Graveyard and Exile where a face-down card isn't the
 * right metaphor. Icon sits as a subtle watermark; count centered on top.
 *
 * Accepts a ref + onPointerDown so it can serve as both a drag source (grab
 * the top card) and a drop target (hit-testing uses the forwarded ref).
 */
const LargeZoneBox = forwardRef<
  HTMLDivElement,
  {
    icon: typeof Heart;
    label: string;
    count: number;
    /** Top card of the pile — its art fills the box so the zone visually
     *  represents what's on top of the physical pile. Null when empty. */
    topCard?: { name: string; scryfallId: string } | null;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    /** Wire owner + zone name, applied as `data-arrow-anchor-*` attrs
     *  so the arrow overlay can anchor arrows to the whole pile when
     *  the specific source card element isn't in the DOM (typical for
     *  arrows drawn from a grave / exile card — the card lives inside
     *  a portal-rendered pile-view modal that findCardEl can't reach,
     *  or the modal is closed entirely). See useGameArrowOverlay's
     *  `findCardEl` fallback path. */
    arrowAnchorPlayerId?: number;
    arrowAnchorZone?: string;
    /** The pile's control props: its name, count and top card, and its menu opener. */
    pileProps?: HTMLAttributes<HTMLDivElement>;
      }
      >(function LargeZoneBox(
        {
          icon: Icon,
          label,
          count,
          topCard,
          onPointerDown,
          arrowAnchorPlayerId,
          arrowAnchorZone,
          pileProps,
        },
        ref,
      ) {
        const draggable = !!onPointerDown;
        const { setHoveredCard } = useCardPreviewActions();
        return (
          <div className="flex justify-center">
            <div
              ref={ref}
              data-drag-source
              data-arrow-anchor-owner={
                arrowAnchorPlayerId != null ? String(arrowAnchorPlayerId) : undefined
              }
              data-arrow-anchor-zone={arrowAnchorZone}
              {...pileProps}
              onPointerDown={onPointerDown}
              onMouseEnter={topCard ? () => setHoveredCard(topCard) : undefined}
              className={`relative rounded-md border border-border-subtle bg-bg-base/60 overflow-hidden select-none ${GAME_FOCUS_RING}`}
              style={{
                width: CARD_SIDEWAYS_WIDTH,
                height: CARD_SIDEWAYS_HEIGHT,
                cursor: draggable ? 'grab' : undefined,
                touchAction: draggable ? 'none' : undefined,
              }}
              title={
                topCard ? `${label} — ${count} (top: ${topCard.name})` : `${label} — ${count}`
              }
            >
              {topCard && (
                <CardImage
                  // Mirror Card.tsx's fallback: Servatrice's Event_MoveCard
                  // populates `new_card_provider_id` from the server-side card
                  // DB (server_abstract_player.cpp:470,500), which returns
                  // empty for cards not in Servatrice's cards.xml — hitting
                  // `/cards/<empty>` returns 404 → broken image. Fall back to
                  // `/cards/named?exact=<name>` so the graveyard/exile pile
                  // still shows real art when only the name is known.
                  src={getScryfallUrlByIdOrExactName(topCard, ScryfallImageSize.Large)}
                  name={topCard.name}
                  draggable={false}
                  className="pointer-events-none select-none absolute top-1/2 left-1/2"
                  style={{
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                    borderRadius: CARD_CORNER_RADIUS,
                    transform: 'translate(-50%, -50%) rotate(-90deg)',
                  }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-[0.35em] pointer-events-none">
                {!topCard && <Icon size="2.5em" className="text-text-muted shrink-0" />}
                <span
                  className="text-over-art-text font-modern font-bold tabular-nums text-[3em]"
                  style={{ textShadow: OVER_ART_SHADOW }}
                >
                  {count}
                </span>
              </div>
            </div>
          </div>
        );
      });

/**
 * Face-down sideways card representing a zone stack (library, hand, …).
 * Card back image rotated -90°, with a big count centered on top.
 */
const CardBackZone = forwardRef<
  HTMLDivElement,
  {
    label: string;
    count: number;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    /** When set, the pile renders the given card FACE UP in place of
     *  the card back. Drives the "Always reveal top card" /
     *  "Always look at top card" visualization — Cockatrice's
     *  desktop pile paints the top card face when the corresponding
     *  toggle is on (pile_zone.cpp:47-60). GameBoardCell only
     *  supplies this when the appropriate zone-property flag is
     *  active for the viewer. */
    topCard?: { name: string; scryfallId: string } | null;
    /** The pile's control props: its name, count and top card, and its menu opener. */
    pileProps?: HTMLAttributes<HTMLDivElement>;
      }
      >(function CardBackZone({ label, count, onPointerDown, topCard, pileProps }, ref) {
        const draggable = !!onPointerDown;
        return (
          <div className="flex justify-center">
            <div
              ref={ref}
              data-drag-source
              {...pileProps}
              onPointerDown={onPointerDown}
              className={`relative rounded-md overflow-hidden border border-border-strong shadow-inner select-none ${GAME_FOCUS_RING}`}
              style={{
                width: CARD_SIDEWAYS_WIDTH,
                height: CARD_SIDEWAYS_HEIGHT,
                cursor: draggable ? 'grab' : undefined,
                touchAction: draggable ? 'none' : undefined,
              }}
              title={topCard ? `${label} — ${count} (top: ${topCard.name})` : `${label} — ${count}`}
            >
              {topCard ? (
              // Face-up top card via the shared Card renderer (which reads
              // scryfallId / name → art URL). Rotated -90° to match the
              // sideways-pile layout of the card back below. Deliberately
              // NOT pointer-events-none — Card's onMouseEnter needs to
              // fire so the right-rail preview picks up the hovered face.
              // Pile-drag pointerdown still bubbles up to the parent
              // container's handler.
                <div
                  className="select-none absolute top-1/2 left-1/2"
                  style={{
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                    transform: 'translate(-50%, -50%) rotate(-90deg)',
                  }}
                >
                  <Card name={topCard.name} scryfallId={topCard.scryfallId} />
                </div>
              ) : (
                <img
                  src={CARD_BACK_URL}
                  alt=""
                  draggable={false}
                  className="pointer-events-none select-none absolute top-1/2 left-1/2"
                  style={{
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                    // ~7.5% of the card width matches the real MTG corner curve and
                    // hides the white JPG background showing through the rounded card
                    // corners without eating into meaningful art.
                    borderRadius: CARD_CORNER_RADIUS,
                    transform: 'translate(-50%, -50%) rotate(-90deg)',
                  }}
                />
              )}
              {/* Dimming overlay sits behind the count number so the big
            white digits stay readable against the busy card-back art.
            Skipped when a top card is showing — Cockatrice desktop
            renders that face fully un-dimmed, matching the visual
            expectation of a face-up card. */}
              {!topCard && (
                <div className="absolute inset-0 bg-over-art-backdrop/20 pointer-events-none" aria-hidden />
              )}
              <div
                className={[
                  'absolute inset-0 flex items-center justify-center text-over-art-text',
                  'font-modern font-bold tabular-nums text-[3em] pointer-events-none',
                ].join(' ')}
                style={{ textShadow: OVER_ART_SHADOW }}
              >
                {count}
              </div>
            </div>
          </div>
        );
      }
      );

type PileName = 'library' | 'graveyard' | 'exile';

const NO_MODIFIERS = (event: KeyboardEvent) => !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;

/**
 * A pile as a control (desktop's PileZone, which right-clicks to its zone
 * menu): it reads out its name, card count and top card. Enter, Space,
 * Shift+F10 or the Menu key open its menu below it, as a right-click does at
 * the pointer, and focus comes back to the pile when the menu, or a zone view
 * opened from it, closes. A pile with no menu (another player's library) is a
 * labelled image, out of the tab order.
 */
function usePile(pile: PileName, count: number, top: { name: string } | null | undefined, items?: readonly ContextMenuItem[]) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const zone = { library: t('ZoneStack.library'), graveyard: t('ZoneStack.graveyard'), exile: t('ZoneStack.exile') }[pile];
  const label = top
    ? t('ZoneStack.pileWithTop', { zone, count, top: top.name })
    : t('ZoneStack.pile', { zone, count });
  if (!items) {
    return { pileProps: { role: 'img', 'aria-label': label } satisfies HTMLAttributes<HTMLDivElement>, popup: null };
  }
  const pileProps: HTMLAttributes<HTMLDivElement> = {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    'aria-haspopup': 'menu',
    'aria-expanded': anchor != null,
    onContextMenu: (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      triggerRef.current = event.currentTarget;
      setAnchor(contextMenuAnchor(event));
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (isContextMenuKey(event) || ((event.key === 'Enter' || event.key === ' ') && NO_MODIFIERS(event))) {
        event.preventDefault();
        event.stopPropagation();
        triggerRef.current = event.currentTarget;
        setAnchor({ rect: event.currentTarget.getBoundingClientRect(), placement: 'below' });
      }
    },
  };
  const popup = anchor && (
    <ContextMenuPopup items={items} anchor={anchor} label={zone} onClose={() => setAnchor(null)} triggerRef={triggerRef} />
  );
  return { pileProps, popup };
}

/**
 * The seat's zone piles — library, graveyard and exile — stacked in the info
 * column under the mana pool. Each opens Cockatrice's LibraryMenu /
 * GraveyardMenu / RfgMenu (another player's library opens none); the owner can
 * drag the top card off each pile.
 */
export default function ZoneStack() {
  const {
    seatDrag,
    deckTopCard,
    displayedDeckCount,
    displayedExileCount,
    displayedGraveyardCount,
    exileDisplayList,
    exileMenuItemsOpponent,
    exileMenuItemsSelf,
    exileZoneRef,
    graveDisplayList,
    graveMenuItemsOpponent,
    graveMenuItemsSelf,
    graveyardZoneRef,
    isSelf,
    libraryMenuItems,
    libraryZoneRef,
    playerId,
    startPileDrag,
  } = usePlayerSeatContext();
  // A pile shows its top card, or the one under it while the top is dragged off.
  const graveyardTopIdx =
    graveDisplayList.length - 1 - (seatDrag?.zone === 'graveyard' ? 1 : 0);
  const exileTopIdx =
    exileDisplayList.length - 1 - (seatDrag?.zone === 'exile' ? 1 : 0);
  const graveyardTop =
    graveyardTopIdx >= 0 ? graveDisplayList[graveyardTopIdx] : null;
  const exileTop = exileTopIdx >= 0 ? exileDisplayList[exileTopIdx] : null;

  // Cockatrice opens no menu on another player's library. On another
  // player's graveyard and exile, GraveyardMenu / RfgMenu gate the move and
  // reveal entries behind local-or-judge (grave_menu.cpp:19,42,
  // rfg_menu.cpp:16); every viewer still gets the view, the zones are public.
  const library = usePile('library', displayedDeckCount, deckTopCard, isSelf ? libraryMenuItems : undefined);
  const graveyard = usePile('graveyard', displayedGraveyardCount, graveyardTop, isSelf ? graveMenuItemsSelf : graveMenuItemsOpponent);
  const exile = usePile('exile', displayedExileCount, exileTop, isSelf ? exileMenuItemsSelf : exileMenuItemsOpponent);

  return (
    <>
      <div>
        <CardBackZone
          ref={libraryZoneRef}
          label="Library"
          count={displayedDeckCount}
          pileProps={library.pileProps}
          // Pile face: whatever `deckTopCard` holds. The state is the guard:
          // the datatrice cardsRevealed reducer sets topRevealedCard only for
          // the reveal audience (the owner for always-look-at, everyone for
          // always-reveal), and clears it when the top card moves. Toggling
          // off does not clear it: desktop keeps the face until the top
          // changes.
          topCard={deckTopCard ?? null}
          onPointerDown={
            isSelf && displayedDeckCount > 0
              ? (e) => startPileDrag(e, LIBRARY_TOP_DRAG_PAYLOAD, 'library')
              : undefined
          }
        />
        {library.popup}
      </div>
      <div>
        <LargeZoneBox
          ref={graveyardZoneRef}
          icon={Skull}
          label="Graveyard"
          count={displayedGraveyardCount}
          topCard={graveyardTop}
          arrowAnchorPlayerId={playerId}
          arrowAnchorZone={ZoneName.GRAVE}
          pileProps={graveyard.pileProps}
          onPointerDown={
            isSelf && graveDisplayList.length > 0
              ? (e) => startPileDrag(e, graveDisplayList[graveDisplayList.length - 1], 'graveyard')
              : undefined
          }
        />
        {graveyard.popup}
      </div>
      <div>
        <LargeZoneBox
          ref={exileZoneRef}
          icon={Sparkles}
          label="Exile"
          count={displayedExileCount}
          topCard={exileTop}
          arrowAnchorPlayerId={playerId}
          arrowAnchorZone={ZoneName.EXILE}
          pileProps={exile.pileProps}
          onPointerDown={
            isSelf && exileDisplayList.length > 0
              ? (e) => startPileDrag(e, exileDisplayList[exileDisplayList.length - 1], 'exile')
              : undefined
          }
        />
        {exile.popup}
      </div>
    </>
  );
}
