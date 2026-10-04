import { useEffect, useRef, useState, type CSSProperties } from 'react';

import type { games } from '@cockatrice/datatrice';
import { PlaymatImage } from '@app/components';
import type { Size } from '@app/utils';

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
 * The image itself (source fallback, rotation, crop) is the shared PlaymatImage.
 */
export default function PlaymatArt({ art, testId, style }: PlaymatArtProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Size | null>(null);

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

  return (
    <div
      ref={areaRef}
      data-testid={testId}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={style}
      aria-hidden="true"
    >
      <PlaymatImage playmat={art} area={area} />
    </div>
  );
}
