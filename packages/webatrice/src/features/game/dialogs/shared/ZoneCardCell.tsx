import type { CSSProperties, MouseEvent, PointerEvent, ReactElement } from 'react';

import Card from '../../components/ui/SeatCard/SeatCard';
import { CARD_HEIGHT, CARD_WIDTH } from '../../components/ui/SeatCard/cardSize';
import { useCardPreviewActions } from '../../components/ui/CardPreviewContext';
import { SELECTED_RING } from '../../components/ui/seatColors/seatColors';

type HandCard = { id: string; name: string; scryfallId: string };

/** How much of each card but the last a pile shows: enough for its title. */
export const PILE_STEP_FRACTION = 0.25;

/** Where a card sits in a pile: every card but the last shows only a strip. */
export interface PilePlace {
  index: number;
  isLast: boolean;
}

export interface ZoneCardCellProps {
  card: HandCard;
  /** Set for a card in a pile; a grid cell otherwise. */
  pile?: PilePlace;
  /** Marks the cell as one of the view's cards (`data-card`), which its marquee and drop slots find. */
  marked?: boolean;
  /** Whose zone the card is in, marked for arrow hit-testing: an arrow pick or a right-button
   *  drag can then land on, or start from, the card. */
  cardOwner?: { playerId: number; zone: string };
  selected?: boolean;
  /** A card being dragged out of the view: only the drag ghost shows it. */
  hidden?: boolean;
  /** A left press on the card; the card is grabbable while set. */
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * One card in a zone view. In a pile the cell's box is only the visible strip
 * (the last card shows fully), with the card drawn over it at full size and
 * deaf to the pointer, so hovering down a pile hands off from strip to strip
 * instead of sticking on an enlarged card. The cell then does the card's own
 * hover preview and middle-click zoom, which the deaf card cannot.
 */
export function ZoneCardCell({
  card,
  pile,
  marked,
  cardOwner,
  selected,
  hidden,
  onPointerDown,
  onContextMenu,
  className,
  style,
}: ZoneCardCellProps): ReactElement {
  const { setHoveredCard, openBigPreview, closeBigPreview } = useCardPreviewActions();
  const preview = { name: card.name, scryfallId: card.scryfallId };

  const pileProps = pile && {
    onMouseEnter: () => setHoveredCard(preview),
    onMouseDown: (e: MouseEvent<HTMLElement>) => {
      // Held middle button: the big preview, as on a seat card.
      if (e.button !== 1) {
        return;
      }
      e.preventDefault();
      openBigPreview(preview);
      const onUp = (ev: globalThis.MouseEvent) => {
        if (ev.button === 1) {
          closeBigPreview();
          window.removeEventListener('mouseup', onUp);
        }
      };
      window.addEventListener('mouseup', onUp);
    },
    onAuxClick: (e: MouseEvent<HTMLElement>) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    },
  };

  return (
    <div
      {...(marked ? { 'data-card': true, 'data-card-id': card.id } : null)}
      {...(cardOwner ? { 'data-card-owner': cardOwner.playerId, 'data-card-zone': cardOwner.zone } : null)}
      className={pile ? 'absolute left-0 hover:z-10 group' : className}
      onPointerDown={onPointerDown && ((e) => {
        if (e.button === 0) {
          onPointerDown(e);
        }
      })}
      onContextMenu={onContextMenu && ((e) => {
        e.preventDefault();
        onContextMenu(e);
      })}
      {...pileProps}
      style={{
        width: CARD_WIDTH,
        height: pile && !pile.isLast ? `calc(${CARD_HEIGHT} * ${PILE_STEP_FRACTION})` : CARD_HEIGHT,
        ...(pile ? { top: `calc(${CARD_HEIGHT} * ${PILE_STEP_FRACTION} * ${pile.index})` } : null),
        borderRadius: '7.5%',
        boxShadow: selected ? SELECTED_RING : undefined,
        opacity: hidden ? 0 : 1,
        touchAction: onPointerDown ? 'none' : undefined,
        cursor: onPointerDown ? 'grab' : undefined,
        ...style,
      }}
    >
      {pile ? (
        <div
          className="absolute left-0 top-0 pointer-events-none transition-transform duration-150 ease-out group-hover:scale-[1.06]"
          style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
        >
          <Card name={card.name} scryfallId={card.scryfallId} />
        </div>
      ) : (
        <Card name={card.name} scryfallId={card.scryfallId} />
      )}
    </div>
  );
}
