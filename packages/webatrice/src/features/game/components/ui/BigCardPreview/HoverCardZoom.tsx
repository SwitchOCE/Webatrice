import { createPortal } from 'react-dom';

import { useGameCardImage } from '../../../hooks/useGameCardImage';

import { useHoverZoom } from '../CardPreviewContext';
import { CARD_CORNER_RADIUS } from '../SeatCard/cardSize';
import PreviewCardImage from '../PreviewCardImage/PreviewCardImage';
import { useFloatingPreviewLayout, useHoverZoomTarget } from './useFloatingPreview';

export const HOVER_ZOOM_CHROME = { x: 0, y: 0, textWidth: 0 } as const;

export function HoverCardZoom() {
  const zoom = useHoverZoomTarget(useHoverZoom());
  const layout = useFloatingPreviewLayout(zoom?.anchor ?? null, HOVER_ZOOM_CHROME);
  const image = useGameCardImage(zoom?.card);
  if (!zoom) {
    return null;
  }
  return createPortal(
    <div
      data-testid="hover-card-zoom"
      className="pointer-events-none fixed z-[1400] shadow-2xl"
      style={{ left: layout.left, top: layout.top, width: layout.imageWidth, borderRadius: CARD_CORNER_RADIUS }}
    >
      <PreviewCardImage
        src={image.src}
        onError={image.onError}
        name={zoom.card.name}
        className="block w-full"
        style={{ borderRadius: CARD_CORNER_RADIUS, imageRendering: '-webkit-optimize-contrast' }}
      />
    </div>,
    document.body,
  );
}
