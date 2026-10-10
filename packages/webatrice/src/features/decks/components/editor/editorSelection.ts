import type { DeckCard } from '../../types';

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

export interface InspectedCard {
  name: string;
  category: DeckCard['category'];
  scryfallId?: string;
  preview?: DeckCard;
}

export function inspectedRow(card: DeckCard): InspectedCard {
  return { name: card.name, category: card.category, scryfallId: card.scryfallId };
}

export function resolveInspectedRow(cards: readonly DeckCard[], selected: InspectedCard | null): number {
  if (!selected) {
    return -1;
  }
  const lower = selected.name.toLowerCase();
  const sameName = (c: DeckCard) => c.name.toLowerCase() === lower;
  const samePrinting = (c: DeckCard) => (c.scryfallId ?? '') === (selected.scryfallId ?? '');
  if (!selected.preview) {
    return cards.findIndex((c) => c.category === selected.category && sameName(c) && samePrinting(c));
  }
  const candidates = [
    (c: DeckCard) => c.category === selected.category && sameName(c) && (!selected.scryfallId || samePrinting(c)),
    (c: DeckCard) => c.category === selected.category && sameName(c),
    sameName,
  ];
  for (const matches of candidates) {
    const index = cards.findIndex(matches);
    if (index >= 0) {
      return index;
    }
  }
  return -1;
}

export function dockColorIdentity(cards: readonly DeckCard[], isCommander: boolean): string[] {
  const commanders = cards.filter((c) => c.isCommander);
  const source = isCommander && commanders.length > 0 ? commanders : cards;
  const colors = new Set<string>();
  for (const card of source) {
    for (const color of card.colorIdentity ?? card.colors ?? []) {
      colors.add(color.toUpperCase());
    }
  }
  return WUBRG.filter((c) => colors.has(c));
}
