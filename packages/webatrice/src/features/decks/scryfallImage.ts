/**
 * Bump a Scryfall image URL to `normal` resolution — the sweet spot for
 * the ~250px sidebar preview and the printings grid. Handles both URL
 * forms Scryfall serves:
 *   • `api.scryfall.com/cards/<uuid>?format=image&version=small`
 *   • `cards.scryfall.io/small/front/…jpg`  (CDN — path segment size)
 * Non-Scryfall URLs pass through unchanged.
 */
export function upgradeScryfallImageSize(url: string | undefined): string | undefined {
  if (!url) {
    return url;
  }
  if (url.includes('api.scryfall.com')) {
    return url.replace(/([?&])version=[^&]+/i, '$1version=normal');
  }
  if (url.includes('cards.scryfall.io')) {
    return url.replace(/(cards\.scryfall\.io\/)(small|border_crop|art_crop|png|large)(\/)/i, '$1normal$3');
  }
  return url;
}

/**
 * The distinct preview URLs for a set of cards, normalized exactly as
 * the sidebar `<img src>` will request them so a preload is a cache hit.
 */
export function previewImageUrls(cards: ReadonlyArray<{ imageUri?: string }>): string[] {
  return Array.from(
    new Set(
      cards
        .map((c) => upgradeScryfallImageSize(c.imageUri))
        .filter((u): u is string => !!u),
    ),
  );
}
