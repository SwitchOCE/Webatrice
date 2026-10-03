import { serializeCod } from '@app/services';

import type { DeckCard, HydratedDeck } from './types';

/**
 * Deck export writers:
 *   - Plain text — `1 Card Name` lines grouped by section. Universal.
 *   - MTG Arena — includes set + collector number. Also works for
 *     Moxfield / Archidekt / topdecked imports.
 *   - Cockatrice (.cod) — round-trips through `serializeCod`, so the
 *     file keeps format, banner card, tags, comments-meta and per-card
 *     printing hints. Re-importing it is lossless.
 */
export type DeckExportFormat = 'plain' | 'arena' | 'cockatrice';

/**
 * Commander is a per-card flag, not a category — commanders live in
 * main with `isCommander`. They are listed once, under their own
 * section, and excluded from the main section.
 */
function exportSections(cards: DeckCard[]): Array<{ key: 'commander' | 'main' | 'side'; cards: DeckCard[] }> {
  return [
    { key: 'commander', cards: cards.filter((c) => c.isCommander) },
    { key: 'main', cards: cards.filter((c) => c.category === 'main' && !c.isCommander) },
    { key: 'side', cards: cards.filter((c) => c.category === 'sideboard') },
  ];
}

function writeSections(
  cards: DeckCard[],
  headers: Record<'commander' | 'main' | 'side', string>,
  line: (c: DeckCard) => string,
): string {
  const parts: string[] = [];
  for (const section of exportSections(cards)) {
    if (section.cards.length === 0) {
      continue;
    }
    if (parts.length > 0) {
      parts.push('');
    }
    parts.push(headers[section.key]);
    for (const c of section.cards) {
      parts.push(line(c));
    }
  }
  return parts.join('\n');
}

export function toPlainText(cards: DeckCard[]): string {
  return writeSections(
    cards,
    { commander: '// Commander', main: '// Deck', side: '// Sideboard' },
    (c) => `${c.quantity} ${c.name}`,
  );
}

export function toArenaText(cards: DeckCard[]): string {
  return writeSections(
    cards,
    { commander: 'Commander', main: 'Deck', side: 'Sideboard' },
    (c) => {
      const set = c.set ? c.set.toUpperCase() : '';
      const num = c.collectorNumber ?? '';
      if (set && num) {
        return `${c.quantity} ${c.name} (${set}) ${num}`;
      }
      return `${c.quantity} ${c.name}`;
    },
  );
}

export function exportDeck(deck: HydratedDeck, format: DeckExportFormat): string {
  switch (format) {
    case 'arena':
      return toArenaText(deck.cards);
    case 'cockatrice':
      // Same serializer autosave uses, so the exported .cod matches what
      // Servatrice stores — minus the cached bracket assessment, which
      // is only meaningful to webatrice's own deck storage.
      return serializeCod({
        name: deck.name,
        meta: deck.meta,
        cards: deck.cards,
        format: deck.format,
        bannerCard: deck.bannerCard,
        bannerCardProviderId: deck.bannerCardProviderId,
        lastLoadedTimestamp: deck.lastLoadedTimestamp,
        playmatXml: deck.playmatXml,
        sideboardPlansXml: deck.sideboardPlansXml,
        tagsXml: deck.tagsXml,
      });
    case 'plain':
    default:
      return toPlainText(deck.cards);
  }
}

/** Download file name: the slugified deck name plus `extension`. */
export function exportFileName(deckName: string, extension: string): string {
  const slug = deckName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'deck';
  return `${slug}.${extension}`;
}
