import { useLayoutEffect } from 'react';

import { usePreference } from './useSettings';

/** Desktop rounds card corners; the board's radius is tuned to the real MTG corner curve. */
const ROUNDED_CARD_CORNER_RADIUS = '7.5%';

/** Desktop's floor under "Maximum font size for information displayed on cards". */
const MIN_CARD_FONT_SIZE_PX = 9;

/**
 * Applies desktop's Appearance › Card rendering options to every card the client draws, through
 * CSS custom properties on the document root: `--card-corner-radius` ("Use rounded card corners"),
 * `--card-hover-scale` ("Scale cards on mouse over": desktop's 1.1) and `--card-info-font-size`
 * ("Maximum font size for information displayed on cards": fixed pixels, as on desktop), and the
 * card counter colours as `--card-counter-0` to `-5` (Card counters). Mount once, at the app root.
 */
export function useApplyCardPresentation(): void {
  const roundCardCorners = usePreference('roundCardCorners');
  const scaleCards = usePreference('scaleCards');
  const maxFontSize = usePreference('maxFontSizeForCards');
  const cardCounterColorA = usePreference('cardCounterColorA');
  const cardCounterColorB = usePreference('cardCounterColorB');
  const cardCounterColorC = usePreference('cardCounterColorC');
  const cardCounterColorD = usePreference('cardCounterColorD');
  const cardCounterColorE = usePreference('cardCounterColorE');
  const cardCounterColorF = usePreference('cardCounterColorF');

  useLayoutEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--card-corner-radius', roundCardCorners ? ROUNDED_CARD_CORNER_RADIUS : '0px');
    root.setProperty('--card-hover-scale', scaleCards ? '1.1' : '1');
    // A fixed pixel size whatever the card scale, as desktop's (AbstractCardItem::transformPainter,
    // which also never goes below 9).
    root.setProperty('--card-info-font-size', `${Math.max(MIN_CARD_FONT_SIZE_PX, maxFontSize)}px`);
  }, [roundCardCorners, scaleCards, maxFontSize]);

  useLayoutEffect(() => {
    const root = document.documentElement.style;
    [cardCounterColorA, cardCounterColorB, cardCounterColorC, cardCounterColorD, cardCounterColorE, cardCounterColorF]
      .forEach((color, id) => root.setProperty(`--card-counter-${id}`, `#${color}`));
  }, [cardCounterColorA, cardCounterColorB, cardCounterColorC, cardCounterColorD, cardCounterColorE, cardCounterColorF]);
}
