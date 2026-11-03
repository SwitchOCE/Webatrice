import { ScryfallImageSize } from '@cockatrice/datatrice';

import { getScryfallUrlById } from '@app/services';

import { searchCardAsPreview, type ScryfallSearchCard } from '../../search';
import type { CardPrinting } from '../../deckEdits';
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
  if (selected.scryfallId) {
    return cards.findIndex((c) => sameName(c) && samePrinting(c));
  }
  const candidates = [
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

export function inspectedCardTargets(cards: readonly DeckCard[], selected: InspectedCard) {
  const index = resolveInspectedRow(cards, selected);
  const row = cards[index];
  const card = selected.preview ?? row ?? {
    name: selected.name, quantity: 0, category: selected.category, scryfallId: selected.scryfallId, lookupSource: 'unknown' as const,
  };
  const printingId = selected.preview ? selected.scryfallId : card.scryfallId;
  const zoneIndex = (sideboard: boolean) => {
    if (!selected.preview && row && (row.category === 'sideboard') === sideboard) {
      return index;
    }
    return cards.findIndex((other) => (other.category === 'sideboard') === sideboard
      && other.name.toLowerCase() === card.name.toLowerCase()
      && (selected.preview && !printingId ? true : (other.scryfallId ?? '') === (printingId ?? '')));
  };
  return { card, mainIndex: zoneIndex(false), sideIndex: zoneIndex(true), printingIndex: selected.preview ? -1 : index };
}

export function selectionAfterPrinting(
  cards: readonly DeckCard[],
  selected: InspectedCard | null,
  index: number,
  printing: CardPrinting,
): InspectedCard | null {
  return selected && !selected.preview && resolveInspectedRow(cards, selected) === index
    ? inspectedRow({ ...cards[index], scryfallId: printing.scryfallId })
    : selected;
}

export function reconcileInspectedSelection(cards: readonly DeckCard[], selected: InspectedCard | null): InspectedCard | null {
  if (!selected || selected.preview || resolveInspectedRow(cards, selected) >= 0) {
    return selected;
  }
  const copies = cards.filter((card) => card.name.toLowerCase() === selected.name.toLowerCase());
  const remaining = copies.find((card) => (card.scryfallId ?? '') === (selected.scryfallId ?? '')) ?? copies[0];
  return remaining ? inspectedRow(remaining) : null;
}

export function searchCardInspection(card: ScryfallSearchCard, providerId?: string): InspectedCard {
  const preview = searchCardAsPreview(card);
  return {
    name: card.name,
    category: 'main',
    scryfallId: providerId,
    preview: providerId && providerId !== card.id
      ? { ...preview, scryfallId: providerId, imageUri: getScryfallUrlById(providerId, ScryfallImageSize.Normal), imageUris: undefined }
      : preview,
  };
}

export interface PreviewTarget {
  card: InspectedCard | null;
  index: number;
}

export function resolvePreviewTarget(
  cards: readonly DeckCard[],
  hovered: InspectedCard | null,
  selected: InspectedCard | null,
): PreviewTarget {
  if (hovered) {
    const index = resolveInspectedRow(cards, hovered);
    if (index >= 0 || hovered.preview) {
      return { card: hovered, index };
    }
  }
  return { card: selected, index: resolveInspectedRow(cards, selected) };
}

export function dockColorIdentity(cards: readonly DeckCard[], isCommander: boolean): string[] | undefined {
  const commanders = cards.filter((c) => c.isCommander);
  if (!isCommander || commanders.length === 0 || commanders.some((c) => c.colorIdentity == null)) {
    return undefined;
  }
  const colors = new Set(commanders.flatMap((c) => c.colorIdentity ?? []).map((color) => color.toUpperCase()));
  return WUBRG.filter((c) => colors.has(c));
}
