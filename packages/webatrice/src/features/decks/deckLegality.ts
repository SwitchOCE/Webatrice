import type { CardCondition, Format, LookupResult } from '@app/services';
import { isMtgFormat } from '@app/types';

import type { DeckCard } from './types';

/**
 * Card legality for the deck's format — desktop `DeckListModel`
 * `refreshCardFormatLegalities` / `isCardQuantityLegalForFormat`, with the
 * rule matching of `format_legality_rules.cpp`.
 *
 * Desktop paints a card it can't find in its database as illegal. The web
 * client often has no local card database, so a card with no legality data
 * is reported as `unknown` ("couldn't be checked") rather than illegal, and
 * a format nobody publishes legality for is "validation unavailable" rather
 * than an all-red deck.
 */

/** What legality needs to know about a card (desktop `CardInfo`). */
export interface LegalityFacts {
  name: string;
  text?: string;
  properties?: Record<string, string>;
  /** Format → label; `undefined` when the source has no legality data. */
  legalities?: Record<string, string>;
}

export function legalityFacts(lookup: LookupResult | undefined): LegalityFacts | undefined {
  if (!lookup?.found) {
    return undefined;
  }
  return { name: lookup.name, text: lookup.text, properties: lookup.properties, legalities: lookup.legalities };
}

/** `-1` is "unlimited", as in desktop's `AllowedCount` / `ExceptionRule`. */
const UNLIMITED = -1;

export interface FormatRules {
  allowedCounts: { label: string; max: number }[];
  exceptions: { conditions: CardCondition[]; maxCopies: number }[];
}

function parseMax(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === 'unlimited') {
    return UNLIMITED;
  }
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** The imported `<format>` element as rules (desktop `FormatRules`). */
export function toFormatRules(format: Format | undefined): FormatRules | undefined {
  if (!format) {
    return undefined;
  }
  return {
    allowedCounts: (format.allowedCounts ?? []).map((c) => ({ label: c.label.trim(), max: parseMax(c.max) })),
    exceptions: (format.exceptions ?? []).map((e) => ({ conditions: e.conditions, maxCopies: parseMax(e.maxCopies) })),
  };
}

/** `cardMatchesCondition`: `name`, `text`, else the named card property. */
export function cardMatchesCondition(card: LegalityFacts, cond: CardCondition): boolean {
  const field = cond.field === 'name'
    ? card.name
    : cond.field === 'text'
      ? card.text ?? ''
      : card.properties?.[cond.field] ?? '';
  const lower = (s: string) => s.toLowerCase();
  switch (cond.match) {
    case 'notEquals':
      return field !== cond.value;
    case 'contains':
      return lower(field).includes(lower(cond.value));
    case 'notContains':
      return !lower(field).includes(lower(cond.value));
    case 'regex':
      try {
        return new RegExp(cond.value, 'i').test(field);
      } catch {
        return false;
      }
    case 'equals':
    default:
      return field === cond.value;
  }
}

export type IllegalReason = 'banned' | 'notLegal' | 'tooMany';

export type CardLegality =
  | { status: 'legal' }
  | { status: 'illegal'; reason: IllegalReason; max?: number }
  | { status: 'unknown' };

const LEGAL: CardLegality = { status: 'legal' };
const UNKNOWN: CardLegality = { status: 'unknown' };

function legalityLabel(card: LegalityFacts, format: string): string {
  const key = format.toLowerCase();
  for (const [name, label] of Object.entries(card.legalities ?? {})) {
    if (name.toLowerCase() === key) {
      return label;
    }
  }
  return '';
}

function notLegal(label: string): CardLegality {
  return { status: 'illegal', reason: label === 'banned' ? 'banned' : 'notLegal' };
}

/** `isCardQuantityLegalForFormat`, with unknown data kept apart from illegal. */
export function cardLegality(
  format: string,
  card: LegalityFacts | undefined,
  quantity: number,
  rules: FormatRules | undefined,
): CardLegality {
  if (!format.trim()) {
    return LEGAL;
  }
  if (!card || card.legalities === undefined) {
    return UNKNOWN;
  }

  // No rules for the format: the card's own label decides; counts aren't checked.
  if (!rules) {
    const label = legalityLabel(card, format);
    return label === 'legal' || label === 'restricted' ? LEGAL : notLegal(label);
  }

  // Exceptions always win.
  if (rules.exceptions.some((ex) => ex.conditions.every((cond) => cardMatchesCondition(card, cond)))) {
    return LEGAL;
  }

  const label = legalityLabel(card, format);
  if (!label) {
    return notLegal(label);
  }
  const allowed = rules.allowedCounts.find((c) => c.label === label);
  // Desktop's `maxAllowedForLegality` returns -1 both for "label not listed"
  // and for an `unlimited` count, and treats both as illegal; only the
  // missing label is illegal here (see the PR notes).
  if (!allowed) {
    return notLegal(label);
  }
  if (allowed.max === UNLIMITED || quantity <= allowed.max) {
    return LEGAL;
  }
  return allowed.max === 0 ? notLegal(label) : { status: 'illegal', reason: 'tooMany', max: allowed.max };
}

export type DeckLegalityStatus = 'legal' | 'illegal' | 'unavailable' | 'none';

export interface DeckLegality {
  /** By card index; the deck's cards in order. */
  rows: CardLegality[];
  /** `none`: no format or no cards to check. `unavailable`: nothing could be checked. */
  status: DeckLegalityStatus;
  illegalCount: number;
  unknownCount: number;
}

/**
 * Legality of every row for the deck's format. Like desktop, each row (a
 * card in one zone) is checked against its own quantity.
 */
export function deckLegality(
  cards: readonly DeckCard[],
  format: string,
  factsByName: ReadonlyMap<string, LegalityFacts | undefined>,
  rules: FormatRules | undefined,
): DeckLegality {
  if (!format.trim() || cards.length === 0) {
    return { rows: cards.map(() => LEGAL), status: 'none', illegalCount: 0, unknownCount: 0 };
  }
  const rows = cards.map((card) => cardLegality(format, factsByName.get(card.name), card.quantity, rules));
  const illegalCount = rows.filter((r) => r.status === 'illegal').length;
  const unknownCount = rows.filter((r) => r.status === 'unknown').length;
  // A format with no imported rules that no card has a label for, and that
  // isn't a known MTG format, is a custom one: nothing to check against.
  const formatKnown = rules !== undefined || isMtgFormat(format) || cards.some((card) => {
    const facts = factsByName.get(card.name);
    return facts?.legalities !== undefined && legalityLabel(facts, format) !== '';
  });
  let status: DeckLegalityStatus;
  if (!formatKnown || unknownCount === cards.length) {
    status = 'unavailable';
  } else {
    status = illegalCount > 0 ? 'illegal' : 'legal';
  }
  return { rows, status, illegalCount, unknownCount };
}
