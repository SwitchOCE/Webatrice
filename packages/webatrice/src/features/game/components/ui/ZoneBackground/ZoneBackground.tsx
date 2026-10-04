import { usePreference } from '@app/hooks';
import type { ZoneBackgroundZone } from '@app/types';

import PlaymatArt from '../../PlayerPlaymat/PlaymatArt';

/**
 * The user's background for a board zone, behind everything the zone draws: desktop's theme
 * images for the hand, stack, table and player area (ThemeManager::getExtraBgBrush), here a
 * card's art cropped like a playmat (Appearance › Zone backgrounds). Renders nothing for a zone
 * without one. Its parent must be positioned and isolated (its own stacking context), since the
 * art sits below the parent's content.
 */
export default function ZoneBackground({ zone }: { zone: ZoneBackgroundZone }) {
  const background = usePreference('zoneBackgrounds')?.[zone];
  if (!background?.cardName) {
    return null;
  }
  return <PlaymatArt art={background} testId={`zone-background-${zone}`} style={{ zIndex: -1 }} />;
}
