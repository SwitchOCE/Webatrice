import type { DeckCard } from '../../types';

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

export interface InspectedCard {
  name: string;
  category: DeckCard['category'];
  scryfallId?: string;
}

export function resolveInspectedRow(cards: readonly DeckCard[], selected: InspectedCard | null): number {
  if (!selected) {
    return -1;
  }
  const lower = selected.name.toLowerCase();
  const exact = cards.findIndex((c) => c.category === selected.category && c.name.toLowerCase() === lower);
  if (exact >= 0) {
    return exact;
  }
  return cards.findIndex((c) => c.name.toLowerCase() === lower);
}

export function isInspectedRow(card: DeckCard, selected: InspectedCard | null): boolean {
  return selected != null
    && selected.category === card.category
    && selected.name.toLowerCase() === card.name.toLowerCase();
}

export function dockColorIdentity(cards: readonly DeckCard[], isCommander: boolean): string[] {
  const commanders = cards.filter((c) => c.isCommander);
  const source = isCommander && commanders.length > 0 ? commanders : cards;
  const colors = new Set<string>();
  for (const card of source) {
    for (const color of card.colors ?? []) {
      colors.add(color.toUpperCase());
    }
  }
  return WUBRG.filter((c) => colors.has(c));
}
