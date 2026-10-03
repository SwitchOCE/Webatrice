import { ScryfallImageSize } from '@cockatrice/datatrice';

import { cleanScryfallName, scryfallCardUrl, scryfallNamedUrl } from './client';

/**
 * Scryfall card-image URLs. Every image the client loads from Scryfall's
 * API is built here, so two views of the same card ask for the same URL
 * and share the browser cache (the deck-card prefetch relies on that).
 */

export function getScryfallUrlById(
  providerId: string,
  size: ScryfallImageSize = ScryfallImageSize.Small,
): string {
  return `${scryfallCardUrl(providerId)}?format=image&version=${size}`;
}

/** An image by exact name, as given: no "Token" suffix stripping. */
export function getScryfallUrlByExactName(
  name: string,
  size: ScryfallImageSize = ScryfallImageSize.Small,
): string {
  return `${scryfallNamedUrl(name)}&format=image&version=${size}`;
}

export function getScryfallUrlByName(
  name: string,
  size: ScryfallImageSize = ScryfallImageSize.Small,
): string {
  // See .github/instructions/webatrice.instructions.md#protocol-quirks.
  return getScryfallUrlByExactName(cleanScryfallName(name), size);
}

export function getScryfallUrl(
  card: { providerId?: string; name?: string },
  size: ScryfallImageSize = ScryfallImageSize.Small,
): string | null {
  if (card.providerId) {
    return getScryfallUrlById(card.providerId, size);
  }
  if (card.name) {
    return getScryfallUrlByName(card.name, size);
  }
  return null;
}

/**
 * Scryfall's SVG for a mana or rules symbol. Accepts a bare symbol (`W`,
 * `2`) or a braced token (`{W/U}`). Hybrid/phyrexian tokens drop the slash
 * on the CDN (`{W/U}` → `WU.svg`, `{2/W}` → `2W.svg`).
 */
export function getScryfallSymbolUrl(symbol: string): string {
  const inner = /^\{[^}]+\}$/.test(symbol) ? symbol.slice(1, -1) : symbol;
  return `https://svgs.scryfall.io/card-symbols/${inner.replace(/\//g, '')}.svg`;
}

/** A board card's image: its printing by Scryfall id when it has one, else
 *  its exact name (a card Servatrice knows only by name has an empty id). */
export function getScryfallUrlByIdOrExactName(
  card: { scryfallId?: string; name: string },
  size: ScryfallImageSize,
): string {
  return card.scryfallId
    ? getScryfallUrlById(card.scryfallId, size)
    : getScryfallUrlByExactName(card.name, size);
}
