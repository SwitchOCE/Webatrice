import { useLayoutEffect } from 'react';

import { usePreference } from './useSettings';

/** Desktop rounds card corners; the board's radius is tuned to the real MTG corner curve. */
const ROUNDED_CARD_CORNER_RADIUS = '7.5%';

/**
 * Applies desktop's Appearance › Card rendering options to every card the client draws, through
 * CSS custom properties on the document root: `--card-corner-radius` ("Use rounded card corners"),
 * `--card-hover-scale` ("Scale cards on mouse over": desktop's 1.1) and `--card-info-font-size`
 * ("Maximum font size for information displayed on cards", desktop pixels at card scale, so it
 * grows and shrinks with the cards). Mount once, at the app root.
 */
export function useApplyCardPresentation(): void {
  const roundCardCorners = usePreference('roundCardCorners');
  const scaleCards = usePreference('scaleCards');
  const maxFontSize = usePreference('maxFontSizeForCards');

  useLayoutEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--card-corner-radius', roundCardCorners ? ROUNDED_CARD_CORNER_RADIUS : '0px');
    root.setProperty('--card-hover-scale', scaleCards ? '1.1' : '1');
    // Desktop's card dimensions are 72 px wide; the board scales them through --card-width.
    root.setProperty('--card-info-font-size', `calc(var(--card-width, 72px) * ${maxFontSize} / 72)`);
  }, [roundCardCorners, scaleCards, maxFontSize]);
}
