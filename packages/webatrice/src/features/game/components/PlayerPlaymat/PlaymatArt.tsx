import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { ScryfallImageSize, type games } from '@cockatrice/datatrice';
import { getScryfallUrl } from '@app/services';
import { playmatImageBox, type Size } from '@app/utils';

interface PlaymatArtProps {
  /** The card whose art fills the area, and how it is cropped. */
  art: games.Playmat;
  testId?: string;
  /** Extra styles for the area (e.g. a z-index to sit under a zone's content). */
  style?: CSSProperties;
}

/**
 * A card's art cropped by playmat params and cover-fitted to its positioned parent, the DOM
 * stand-in for desktop's PlaymatUtils crop (computeArtSourceRect / coverFitRect). Fills the
 * parent and ignores the pointer, so it can sit under a board area without affecting its layout.
 */
export default function PlaymatArt({ art, testId, style }: PlaymatArtProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Size | null>(null);
  const [card, setCard] = useState<Size | null>(null);

  const src = getScryfallUrl({ providerId: art.cardProviderId, name: art.cardName }, ScryfallImageSize.Large);

  useEffect(() => {
    setCard(null);
  }, [src]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const measure = () => setArea({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!src) {
    return null;
  }

  const box = card && area ? playmatImageBox(card, art.params, area) : null;

  return (
    <div
      ref={areaRef}
      data-testid={testId}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={style}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        draggable={false}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          setCard({ width: naturalWidth, height: naturalHeight });
        }}
        className="absolute max-w-none"
        style={box
          ? { left: box.x, top: box.y, width: box.width, height: box.height }
          // Hidden until the art's natural size is known and the crop can be placed.
          : { visibility: 'hidden' }}
      />
    </div>
  );
}
