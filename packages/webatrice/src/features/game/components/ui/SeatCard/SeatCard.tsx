import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreference } from '@app/hooks';
import { ScryfallImageSize } from '@cockatrice/datatrice';
import { CardImage } from '@app/components';
import { cleanScryfallName, getScryfallUrlByIdOrExactName } from '@app/services';
import { CARD_BACK_URL, CARD_CORNER_RADIUS, CARD_HEIGHT, CARD_WIDTH } from './cardSize';
import { useCardPreviewActions } from '../CardPreviewContext';
import { counterLetter } from './cardLabel';
import { counterColorForId } from './counterColors';


/**
 * A single MTG card as it appears on a seat (hand, battlefield, stack,
 * zone views, the drag ghost). Visual only: drags, taps and menus are
 * wired by the region that renders it.
 *
 * Image source: prefers `scryfallId` when known (returns the exact
 * printing chosen in the deck), falls back to `/cards/named?exact=`
 * for name-only entries. Both endpoints redirect to CDN URLs that
 * cache aggressively across the session.
 *
 * On mouse-enter the card publishes itself to the game preview store so
 * the right-rail preview (BattlefieldSidebar) can show it enlarged.
 * The hover-scale + tight name pill are ported straight from fancy
 * webatrice.
 */
// Desktop's "Maximum font size for information displayed on cards", in fixed
// pixels (useApplyCardPresentation); 0.7rem where nothing sets it.
const CARD_INFO_FONT_SIZE = 'var(--card-info-font-size, 0.7rem)';

interface Props {
  name: string;
  scryfallId?: string;
  /** Power/toughness pill rendered in the bottom-right — e.g. `"2/2"`
   *  for creatures/vehicles, or a modified value like `"3/4"` when
   *  Cockatrice's `AttrPT` has been applied. Undefined / empty
   *  suppresses the pill (non-creature cards). */
  pt?: string;
  /** Printed base PT from the card face (Scryfall lookup). Used to
   *  color-code the pill: white when `pt` matches the base, dark
   *  orange when it differs (or when the card is face-down). Matches
   *  Cockatrice's `CardItem::paint` behavior for modified P/T. */
  basePT?: string;
  /** Free-form player-set annotation (Cockatrice's `AttrAnnotation`)
   *  rendered as a centered pill over the card art. Also used by
   *  Clone to label a copy as `"token"`. Undefined / empty
   *  suppresses the pill. */
  annotation?: string;
  /** Numeric card id (server-assigned). When rendered face-down, the
   *  name pill shows `"# {id}"` in place of the card name — matches
   *  Cockatrice's `AbstractCardItem::paintPicture` behavior for
   *  morphed / manifested cards. */
  id?: string;
  /** Face-down cards render the MTG card back in place of the art,
   *  and swap the name pill for a `"# {id}"` label. PT + annotation
   *  pills still render (Cockatrice keeps them visible) so a
   *  manifested creature's P/T remains readable. */
  faceDown?: boolean;
  /** Per-card counters (slot id → value). Rendered as colored circular
   *  badges arranged in up to 3 rows down the card sides, matching
   *  Cockatrice's `paintNumberEllipse` layout in card_item.cpp. Slot id
   *  picks the color from counterColorForId. */
  counters?: readonly { id: number; value: number }[];
  /** Explicit image URL override. When set, replaces the composed
   *  scryfallId / name-based Scryfall URL. Used by the caller to
   *  point a card at a DFC back-face image after a transform
   *  (Scryfall's default card record and its providerId both point
   *  at the front face — the back face's image lives on a different
   *  URL sourced from `card_faces[N].image_uris`). Falls back to
   *  the default composition when undefined. */
  imageUri?: string;
}

export default function Card({ name, scryfallId, pt, basePT, annotation, id, faceDown, counters, imageUri }: Props) {
  // Cockatrice's rule (card_item.cpp): PT is orange when face-down or
  // when the current PT differs from the printed base; otherwise white.
  // A missing basePT (non-creature with no printed PT) can't be
  // "different," so the pill stays white unless the card is face-down.
  const ptModified = !!pt && (faceDown || (!!basePT && pt !== basePT));
  // `large` (672×936, ~100KB JPG) is roughly half the download of
  // `png` (lossless 745×1040, ~200KB) and looks basically identical
  // at our display size. Faster load matters more here than the
  // slight quality bump.
  // Scryfall names tokens without the "Token" suffix — a card the
  // server calls "Rhino Warrior Token" resolves as "Rhino Warrior"
  // on `/cards/named?exact=`. Strip the suffix (with or without
  // parens) before hitting the endpoint so tokens spawned via
  // Command_CreateToken with the Cockatrice-style " Token" naming
  // still get art.
  const scryfallLookupName = cleanScryfallName(name) || name;
  const imageUrl = faceDown
    ? CARD_BACK_URL
    : imageUri
      ? imageUri
      : getScryfallUrlByIdOrExactName({ scryfallId, name: scryfallLookupName }, ScryfallImageSize.Large);

  // Cockatrice paints a face-down card's label as `"# {id}"` (see
  // `AbstractCardItem::paintPicture`). We use the same "# " prefix so
  // players who bounce between the clients see a familiar tag.
  const displayName = faceDown && id != null ? `# ${id}` : name;
  // Desktop's "Display card names on cards having a picture": the name is
  // always drawn on a face-down card and on one without its picture, still
  // loading or failed (AbstractCardItem::paintPicture: a null pixmap); with
  // the option off, nowhere else.
  const displayCardNames = usePreference('displayCardNames');
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const showName = displayCardNames || !!faceDown || !imageUrl || loadedImageUrl !== imageUrl;

  const { setHoveredCard, openBigPreview, closeBigPreview } = useCardPreviewActions();
  const { t } = useTranslation();

  return (
    <div
      // "Scale cards on mouse over" (desktop's 1.1) through --card-hover-scale.
      className={
        'seat-card relative shadow-md select-none overflow-hidden board-motion transition-transform duration-150 ease-out '
        + 'hover:scale-[var(--card-hover-scale,1.1)]'
      }
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: CARD_CORNER_RADIUS,
      }}
      // The tooltip names each counter's type, which the badge shows only as a colour.
      title={[displayName, ...(counters ?? []).map((c) => t('SeatCard.counterBadge', { letter: counterLetter(c.id), count: c.value }))]
        .join('\n')}
      onMouseEnter={() => {
        // Face-down cards don't publish to the hover preview — the true
        // face isn't shown while the card is flipped down (matches
        // Cockatrice, which paints only the back until the card is
        // turned face-up). Pass `imageUri` through so DFC back-face art
        // survives to the preview (Scryfall's default image endpoint
        // always returns the front face). PT + annotation ride along
        // so the sidebar's text-mode preview can render them when the
        // Scryfall fetch fails (user-created tokens without a
        // matching Scryfall record).
        if (faceDown) {
          return;
        }
        setHoveredCard({ name, scryfallId, imageUri, pt, annotation });
      }}
      // Press-and-hold middle mouse to zoom the card (image + full
      // description). Opens on mousedown, dismisses on release —
      // matches Cockatrice's `card_zone.cpp` middle-button hold
      // behavior. Face-down cards skip it (there's nothing to zoom
      // to). preventDefault suppresses the browser's autoscroll
      // cursor. The mouseup listener is attached to `window` because
      // the user may drag off the card before releasing, and React's
      // onMouseUp only fires when the release happens on the same
      // element.
      onMouseDown={(e) => {
        if (e.button !== 1 || faceDown) {
          return;
        }
        e.preventDefault();
        openBigPreview({ name, scryfallId, imageUri });
        const handleUp = (ev: MouseEvent) => {
          if (ev.button !== 1) {
            return;
          }
          closeBigPreview();
          window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mouseup', handleUp);
      }}
      // Also suppress the auxclick that Chrome/Firefox fire on middle
      // button release — without this a synthetic auxclick can bubble
      // to ancestor listeners that treat middle-click as "open in new
      // tab" or similar.
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
        }
      }}
    >
      <CardImage
        src={imageUrl}
        // Don't pass `name` — this card already renders its name
        // (or "# {id}" for face-down) in the top-left pill overlay
        // below. A duplicate name inside the fallback would read as
        // redundant. Surfaces without their own name overlay
        // (sidebar preview, popped-out window, pile top-card) still
        // pass `name` so their placeholder identifies the card.
        draggable={false}
        className="w-full h-full"
        style={{ imageRendering: '-webkit-optimize-contrast' }}
        onLoad={() => setLoadedImageUrl(imageUrl ?? null)}
      />
      {/* Card name — small pill overlay anchored to the top-left.
          Mirrors the P/T pill's bottom-right anchoring so the two
          corners bookend the card art. `line-clamp-2` lets long names
          wrap to a second line before ellipsizing, and the inner
          `box-decoration-clone` span redraws the background around
          each line individually so the black pill hugs the text
          instead of stretching to the container width. */}
      {showName && (
        <div
          className="absolute top-1 left-1 right-1 font-semibold leading-tight line-clamp-2"
          style={{ fontSize: CARD_INFO_FONT_SIZE }}
        >
          <span className="bg-over-art-backdrop text-over-art-text rounded box-decoration-clone">
            {displayName}
          </span>
        </div>
      )}
      {/* P/T pill — same style as the name pill but anchored to the
          bottom-right. Only rendered when we have a value (creatures,
          vehicles, or any card whose in-game PT has been modified). */}
      {pt && (
        <div className="absolute bottom-1 right-1 flex justify-end">
          <span
            className={[
              'bg-over-art-backdrop font-semibold leading-none px-1.5 py-0.5 rounded tabular-nums',
              ptModified ? 'text-pt-modified' : 'text-over-art-text',
            ].join(' ')}
            style={{ fontSize: `calc(${CARD_INFO_FONT_SIZE} * 0.85)` }}
          >
            {pt}
          </span>
        </div>
      )}
      {/* Card counters — colored circular badges arranged in up to 3
          rows down the card sides. Cockatrice paints them BEFORE the
          annotation (card_item.cpp:85-93 vs :117-129), so the DOM
          order here puts them ahead of the annotation pill and the
          annotation renders on top. Positions match `paintNumberEllipse`'s
          formula: xOffset ≈ 14% (10px on a 72px card), yOffset ≈ 20%
          (20px on a 102px card), row spacing ≈ (h+2)/height. Only
          non-zero counters are in the list (Servatrice strips zeros). */}
      {counters && counters.length > 0 && (
        <div className="absolute inset-0 pointer-events-none">
          {counters.map((c, i) => {
            // Layout position — 6 slots, 3 rows × 2 cols (left/right).
            // Even index → left side, odd → right; row = floor(i/2).
            const row = Math.floor(i / 2);
            const isLeft = i % 2 === 0;
            const rowTop = `${20 + row * 24}%`;
            // Center a lone counter horizontally, and center the 3rd
            // (index 2) if it's the only one on its row. Matches
            // Cockatrice's `count == 1` and `count == 3` special-cases.
            const centered =
              (counters.length === 1) || (counters.length === 3 && i === 2);
            const color = counterColorForId(c.id);
            return (
              <div
                key={i}
                className="absolute flex items-center justify-center font-serif font-bold text-black tabular-nums"
                style={{
                  // Circle size proportional to card so it scales with
                  // the whole board. ~28% of card width matches
                  // Cockatrice's fontSize-14-on-72-wide-card ratio.
                  width: 'calc(var(--card-width, 72px) * 0.28)',
                  height: 'calc(var(--card-width, 72px) * 0.28)',
                  fontSize: 'calc(var(--card-width, 72px) * 0.18)',
                  lineHeight: 1,
                  borderRadius: '50%',
                  backgroundColor: color,
                  top: rowTop,
                  ...(centered
                    ? { left: '50%', transform: 'translateX(-50%)' }
                    : isLeft
                      ? { left: '8%' }
                      : { right: '8%' }),
                }}
              >
                {c.value}
              </div>
            );
          })}
        </div>
      )}
      {/* Annotation pill — free-form label overlaid at the card's
          center. Same box-decoration-clone trick as the name pill so
          the black pill hugs each line of text instead of stretching
          to the container width. Used for both user-set annotations
          and the "token" label auto-applied to Clone-created copies. */}
      {annotation && (
        <div
          className="absolute inset-x-1 top-1/2 -translate-y-1/2 text-center font-semibold leading-tight line-clamp-3"
          style={{ fontSize: CARD_INFO_FONT_SIZE }}
        >
          <span className="bg-over-art-backdrop text-over-art-text rounded box-decoration-clone">
            {annotation}
          </span>
        </div>
      )}
    </div>
  );
}
