import { useEffect, useState, type CSSProperties } from 'react';
import { CardImage } from '@app/components';
import { usePreference } from '@app/hooks';
import { lookupCardsCached } from '@app/services';

/** Whether the named card is a sideways-layout card (battle, split card, plane); false until known. */
function useLandscapeCard(name: string | undefined): boolean {
  const [landscape, setLandscape] = useState<{ name: string; value: boolean } | null>(null);
  useEffect(() => {
    if (!name) {
      return;
    }
    let cancelled = false;
    lookupCardsCached([name])
      .then((results) => {
        if (!cancelled) {
          setLandscape({ name, value: !!results.get(name)?.landscape });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [name]);
  return !!name && landscape?.name === name && landscape.value;
}

interface PreviewCardImageProps {
  src: string;
  name?: string;
  className?: string;
  /** Styles for the card's box; its aspect ratio is the card's (5:7, or 7:5 turned sideways). */
  style?: CSSProperties;
}

/**
 * A card preview's picture. With desktop's "Auto-Rotate cards with sideways layout" on (the
 * default), a battle, split card or plane is turned a quarter clockwise so its landscape art
 * reads upright, as CardInfoPictureWidget does (CardArtUtils::rotateSidewaysLayoutArt).
 */
export default function PreviewCardImage({ src, name, className, style }: PreviewCardImageProps) {
  const autoRotate = usePreference('autoRotateSidewaysLayoutCards');
  const sideways = useLandscapeCard(autoRotate ? name : undefined);

  if (!sideways) {
    return (
      <CardImage src={src} name={name} draggable={false} className={className} style={{ ...style, aspectRatio: '5 / 7' }} />
    );
  }
  // The box is landscape (7:5); the portrait picture inside it is as tall as the box is wide,
  // centred and turned a quarter.
  return (
    <div
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{ ...style, aspectRatio: '7 / 5' }}
      data-sideways
    >
      <CardImage
        src={src}
        name={name}
        draggable={false}
        className="absolute left-1/2 top-1/2 max-w-none"
        style={{
          width: `${(5 / 7) * 100}%`,
          height: `${(7 / 5) * 100}%`,
          transform: 'translate(-50%, -50%) rotate(90deg)',
          imageRendering: style?.imageRendering,
        }}
      />
    </div>
  );
}
