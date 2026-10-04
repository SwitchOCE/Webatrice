import { forwardRef } from 'react';
import { Heart, Skull, Sparkles } from 'lucide-react';
import { ZoneName } from '@cockatrice/sockatrice';
import { CardImage } from '@app/components';

import ContextMenu from '../../context-menus/ContextMenu/ContextMenu';
import { useCardPreviewActions } from '../CardPreviewContext';
import type { PlayerCardViewModel } from '../PlayerBoard/playerBoard.types';
import { usePlayerSeatContext } from '../PlayerBoard/PlayerSeatContext';
import { buildRevealToSubmenu, toRecipient } from '../PlayerBoard/revealRecipient';
import {
  CARD_BACK_URL,
  CARD_CORNER_RADIUS,
  CARD_HEIGHT,
  CARD_SIDEWAYS_HEIGHT,
  CARD_SIDEWAYS_WIDTH,
  CARD_WIDTH,
} from '../SeatCard/cardSize';
import Card from '../SeatCard/SeatCard';

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
              onPointerDown={onPointerDown}
              onMouseEnter={topCard ? () => setHoveredCard(topCard) : undefined}
              className="relative rounded-md border border-border-subtle bg-bg-base/60 overflow-hidden select-none"
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
                  src={
                    topCard.scryfallId
                      ? `https://api.scryfall.com/cards/${topCard.scryfallId}?format=image&version=large`
                      : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(topCard.name)}&format=image&version=large`
                  }
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
                  className="text-white font-modern font-bold tabular-nums text-[3em]"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)' }}
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
      }
      >(function CardBackZone({ label, count, onPointerDown, topCard }, ref) {
        const draggable = !!onPointerDown;
        return (
          <div className="flex justify-center">
            <div
              ref={ref}
              data-drag-source
              onPointerDown={onPointerDown}
              className="relative rounded-md overflow-hidden border border-border-strong shadow-inner select-none"
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
                <div className="absolute inset-0 bg-black/20 pointer-events-none" aria-hidden />
              )}
              <div
                className={[
                  'absolute inset-0 flex items-center justify-center text-white',
                  'font-modern font-bold tabular-nums text-[3em] pointer-events-none',
                ].join(' ')}
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)' }}
              >
                {count}
              </div>
            </div>
          </div>
        );
      }
      );

/**
 * The seat's zone piles — library, graveyard and exile — stacked in the info
 * column under the mana pool. Library and piles get Cockatrice's
 * LibraryMenu / GraveyardMenu / RfgMenu on right-click; the owner can drag the
 * top card off each pile.
 */
export default function ZoneStack() {
  const {
    seatDrag,
    alwaysLookAtTopCard,
    alwaysRevealTopCard,
    bottomLibraryItems,
    deckCount,
    deckTopCard,
    displayedDeckCount,
    displayedExileCount,
    displayedGraveyardCount,
    draw,
    exileDisplayList,
    exileMenuItemsOpponent,
    exileMenuItemsSelf,
    exileZoneRef,
    graveDisplayList,
    graveMenuItemsOpponent,
    graveMenuItemsSelf,
    graveyardZoneRef,
    isSelf,
    libraryZoneRef,
    onOpenDeckInEditor,
    openDrawCardsPrompt,
    openRevealTopCardsPrompt,
    openViewLibraryCountPrompt,
    openZoneView,
    playerId,
    revealTargets,
    seatId,
    shortcutHints,
    startPileDrag,
    topLibraryItems,
    zoneCommands,
  } = usePlayerSeatContext();
  // A pile shows its top card, or the one under it while the top is dragged off.
  const graveyardTopIdx =
    graveDisplayList.length - 1 - (seatDrag?.zone === 'graveyard' ? 1 : 0);
  const exileTopIdx =
    exileDisplayList.length - 1 - (seatDrag?.zone === 'exile' ? 1 : 0);
  const graveyardTop =
    graveyardTopIdx >= 0 ? graveDisplayList[graveyardTopIdx] : null;
  const exileTop = exileTopIdx >= 0 ? exileDisplayList[exileTopIdx] : null;

  return (
    <>
      {isSelf ? (
        <ContextMenu
          items={[
          // Order + labels + shortcuts ported 1:1 from Cockatrice's
          // library context menu (deck_menu.cpp / TabGame shortcuts).
          // Items without onClick render as disabled placeholders
          // — this iteration is a visual match; wiring follows.
            {
              label: 'Draw card',
              onClick: () => draw(1),
              disabled: deckCount <= 0,
              shortcut: shortcutHints['game.drawCard'],
            },
            {
              label: 'Draw cards...',
              onClick: () =>
                openDrawCardsPrompt({ deckSize: deckCount }),
              disabled: deckCount <= 0,
              shortcut: shortcutHints['game.drawMultipleCards'],
            },
            {
              label: 'Undo last draw',
              onClick: () => zoneCommands.undoDraw(),
              // No client-side gate — the server rejects when
              // there's nothing to undo (matches Cockatrice, which
              // also always shows the item enabled).
              shortcut: shortcutHints['game.undoDraw'],
            },
            { divider: true },
            {
              label: 'Shuffle',
              onClick: () => {
                zoneCommands.shuffleLibrary();
              },
              disabled: deckCount <= 1,
              shortcut: shortcutHints['game.shuffleLibrary'],
            },
            { divider: true },
            {
            // "View library" — the zone view dumps the whole library
            // (Command_DumpZone with numberCards=-1). Mirrors
            // Cockatrice's actViewLibrary (player_actions.cpp).
              label: 'View library',
              onClick: () => openZoneView({ playerId: seatId, zoneName: ZoneName.DECK }),
              disabled: deckCount <= 0,
              shortcut: shortcutHints['game.viewLibrary'],
            },
            {
              label: 'View top cards of library...',
              onClick: () =>
                openViewLibraryCountPrompt({
                  isReversed: false,
                  deckSize: deckCount,
                }),
              disabled: deckCount <= 0,
              shortcut: shortcutHints['game.viewTopCards'],
            },
            {
              label: 'View bottom cards of library...',
              // Same flow as "View top cards" but with is_reversed=true
              // on Command_DumpZone: server sends the bottom-N slice
              // face-up, ids equal to their actual deck positions
              // (deckSize-N .. deckSize-1). Reveal dialog labels
              // and reorder math already branch on isReversed.
              onClick: () =>
                openViewLibraryCountPrompt({
                  isReversed: true,
                  deckSize: deckCount,
                }),
              disabled: deckCount <= 0,
              shortcut: shortcutHints['game.viewBottomCards'],
            },
            { divider: true },
            {
            // "Reveal library to..." — mirrors Cockatrice's
            // populateRevealLibraryMenuWithActivePlayers
            // (library_menu.cpp:259-278). "All players"
            // sits at the top (player_id=-1), separator, then
            // one entry per other seated player. Listed even when
            // nobody else is at the table.
              label: 'Reveal library to...',
              submenu: buildRevealToSubmenu(
                revealTargets,
                (targetPlayerId) => zoneCommands.reveal(ZoneName.DECK, toRecipient(targetPlayerId)),
              ),
            },
            {
            // "Lend library to..." — same targets as Reveal
            // but without the "All players" option: Cockatrice's
            // populateLendLibraryMenuWithActivePlayers
            // (library_menu.cpp:280-293) intentionally omits
            // the broadcast entry (write access can only be
            // granted to a single player). Fires
            // Command_RevealCards with grant_write_access=true;
            // the target gains permission to move cards from
            // this player's deck until the next shuffle.
              label: 'Lend library to...',
              submenu:
                revealTargets && revealTargets.length > 0
                  ? revealTargets.map((t) => ({
                    label: t.name,
                    onClick: () => zoneCommands.lendLibrary(t.playerId),
                  }))
                  : [{ label: '(no players)' }],
            },
            {
            // "Reveal top cards to..." — same target list as
            // "Reveal library to..." (All players + separator +
            // one per opponent, per library_menu.cpp:295-314).
            // Each entry opens a numeric prompt for the count
            // (library_menu.cpp:340-342) before firing the wire.
              label: 'Reveal top cards to...',
              submenu: buildRevealToSubmenu(revealTargets, (targetPlayerId) =>
                openRevealTopCardsPrompt({
                  targetPlayerId,
                  targetName: revealTargets.find((t) => t.playerId === targetPlayerId)?.name ?? 'all players',
                  deckSize: deckCount,
                })),
            },
            {
            // "Always reveal top card" — toggles Cockatrice's
            // per-zone always_reveal_top_card flag
            // (library_menu.cpp:197-202,
            // player_actions.cpp:199-205). When ON, everyone
            // (including this player) sees the deck's top card
            // face-up; the server automatically re-emits the
            // reveal on every draw / shuffle / move-to-top via
            // revealTopCardIfNeeded
            // (server_abstract_player.cpp:558-565).
              label: 'Always reveal top card',
              checked: alwaysRevealTopCard ?? false,
              onClick: () =>
                zoneCommands.setAlwaysRevealTopCard(!alwaysRevealTopCard),
              shortcut: shortcutHints['game.alwaysRevealTopCard'],
            },
            {
            // "Always look at top card" — same shape but only
            // the owner sees the face (server-side
            // revealTopCardIfNeeded emits Event_RevealCards
            // privately per server_abstract_player.cpp:567-580).
            // Independent of always-reveal — Cockatrice's menu
            // doesn't gate either on the other.
              label: 'Always look at top card',
              checked: alwaysLookAtTopCard ?? false,
              onClick: () =>
                zoneCommands.setAlwaysLookAtTopCard(!alwaysLookAtTopCard),
              shortcut: shortcutHints['game.alwaysLookAtTopCard'],
            },
            { divider: true },
            {
              // Desktop's top / bottom of library submenus, shared with the
              // battlefield's Library submenu (useLibraryMenuItems).
              label: 'Top of library...',
              disabled: deckCount <= 0,
              submenu: topLibraryItems,
            },
            {
              label: 'Bottom of library...',
              disabled: deckCount <= 0,
              submenu: bottomLibraryItems,
            },
            { divider: true },
            {
            // Opens the deck being played in the deck editor
            // as an unsaved draft; undefined callback ⇒
            // disabled until the deck is known.
              label: 'Open deck in deck editor',
              onClick: onOpenDeckInEditor,
              disabled: !onOpenDeckInEditor,
            },
          ]}
        >
          <CardBackZone
            ref={libraryZoneRef}
            label="Library"
            count={displayedDeckCount}
            // Pile face: show whatever `deckTopCard` is currently
            // populated to. The state itself is the guard — the
            // datatrice cardsRevealed reducer only sets
            // topRevealedCard when the receiver is in the
            // reveal audience (owner for always-look-at,
            // everyone for always-reveal), and top-changing
            // listeners clear it when the position 0 card
            // moves. Toggling off does NOT clear — matches
            // Cockatrice desktop's "keep revealed face
            // visible until top actually changes" behavior.
            topCard={deckTopCard ?? null}
            onPointerDown={
              displayedDeckCount > 0
                ? (e) =>
                  startPileDrag(
                    e,
                    LIBRARY_TOP_DRAG_PAYLOAD,
                    'library',
                  )
                : undefined
            }
          />
        </ContextMenu>
      ) : (
      // Opponent's library — Cockatrice does nothing on
      // right-click here; skip the ContextMenu wrapper entirely.
      // Wrapping div (not raw <CardBackZone>) preserves the same
      // DOM shape the layout above expected from <ContextMenu>.
        <div>
          <CardBackZone
            ref={libraryZoneRef}
            label="Library"
            count={displayedDeckCount}
            // Opponent pile: same principle as the own-pile
            // render above. State is the guard — we only have
            // deckTopCard populated when the opponent had
            // always-reveal on (their private "look at"
            // reveals never reach us).
            topCard={deckTopCard ?? null}
          />
        </div>
      )}
      {isSelf ? (
        <ContextMenu items={graveMenuItemsSelf}>
          <LargeZoneBox
            ref={graveyardZoneRef}
            icon={Skull}
            label="Graveyard"
            count={displayedGraveyardCount}
            topCard={graveyardTop}
            arrowAnchorPlayerId={playerId}
            arrowAnchorZone={ZoneName.GRAVE}
            onPointerDown={
              graveDisplayList.length > 0
                ? (e) =>
                  startPileDrag(
                    e,
                    graveDisplayList[graveDisplayList.length - 1],
                    'graveyard',
                  )
                : undefined
            }
          />
        </ContextMenu>
      ) : (
      // Opponent's graveyard — GraveyardMenu gates the move /
      // reveal-random submenus behind local-or-judge
      // (grave_menu.cpp:19,42); every player still gets "View
      // graveyard" since the zone is public.
        <ContextMenu items={graveMenuItemsOpponent}>
          <LargeZoneBox
            ref={graveyardZoneRef}
            icon={Skull}
            label="Graveyard"
            count={displayedGraveyardCount}
            topCard={graveyardTop}
            arrowAnchorPlayerId={playerId}
            arrowAnchorZone={ZoneName.GRAVE}
          />
        </ContextMenu>
      )}
      {isSelf ? (
        <ContextMenu items={exileMenuItemsSelf}>
          <LargeZoneBox
            ref={exileZoneRef}
            icon={Sparkles}
            label="Exile"
            count={displayedExileCount}
            topCard={exileTop}
            arrowAnchorPlayerId={playerId}
            arrowAnchorZone={ZoneName.EXILE}
            onPointerDown={
              exileDisplayList.length > 0
                ? (e) =>
                  startPileDrag(
                    e,
                    exileDisplayList[exileDisplayList.length - 1],
                    'exile',
                  )
                : undefined
            }
          />
        </ContextMenu>
      ) : (
      // Opponent's exile — RfgMenu gates move behind local-or-judge
      // (rfg_menu.cpp:16); "View exile" is available to any viewer.
        <ContextMenu items={exileMenuItemsOpponent}>
          <LargeZoneBox
            ref={exileZoneRef}
            icon={Sparkles}
            label="Exile"
            count={displayedExileCount}
            topCard={exileTop}
            arrowAnchorPlayerId={playerId}
            arrowAnchorZone={ZoneName.EXILE}
          />
        </ContextMenu>
      )}
    </>
  );
}
