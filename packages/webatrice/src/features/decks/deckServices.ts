import type { DeckCard, HydratedDeck } from './types';

/**
 * The deck editor's online-service helpers — desktop `DeckEditorMenu`:
 * load from a deck site, create a decklist on decklist.org / .xyz, analyze
 * on deckstats.net / tappedout.net. Pure: URL and form building only; the
 * browser side (new tabs, form posts) lives in `browserHandoff`.
 *
 * What a browser can do differs from desktop, which talks to these sites
 * directly over HTTP:
 *   - Loading: every supported site refuses cross-origin reads from a web
 *     page (no CORS headers, or a fixed `localhost` origin), so the editor
 *     can only open the site's own export for the user to copy and paste.
 *   - decklist.org / .xyz: a plain GET, opened in a new tab as on desktop.
 *   - deckstats / TappedOut: desktop POSTs a form and opens the result; a
 *     page can submit the same form into a new tab, where the site answers
 *     directly (desktop instead scrapes the reply for the deck URL).
 */

// ---------- Load from website (DeckLinkToApiTransformer) ----------

export type DeckProvider = 'tappedout' | 'archidekt' | 'moxfield' | 'deckstats';

export interface ParsedDeckLink {
  provider: DeckProvider;
  deckId: string;
  /** The URL desktop fetches (`ParsedDeckInfo::fullUrl`). */
  apiUrl: string;
  /**
   * Where a browser user gets the list as text: the site's plain-text
   * export where it has one (TappedOut, Deckstats), else the deck page,
   * whose Export menu copies the list (Archidekt, Moxfield).
   */
  handoffUrl: string;
  /** True when `handoffUrl` is itself the list as text. */
  handoffIsText: boolean;
}

/** `DeckLinkToApiTransformer::parseDeckUrl`, same patterns, same order. */
export function parseDeckUrl(url: string): ParsedDeckLink | null {
  let match = url.match(/tappedout\.net\/(?:mtg-decks\/)?([^/?#]+)/);
  if (match) {
    const slug = match[1];
    const apiUrl = `https://tappedout.net/mtg-decks/${slug}/?fmt=txt`;
    return { provider: 'tappedout', deckId: slug, apiUrl, handoffUrl: apiUrl, handoffIsText: true };
  }
  match = url.match(/archidekt\.com\/decks\/(\d+)/);
  if (match) {
    const id = match[1];
    return {
      provider: 'archidekt',
      deckId: id,
      apiUrl: `https://archidekt.com/api/decks/${id}/?format=json`,
      handoffUrl: `https://archidekt.com/decks/${id}`,
      handoffIsText: false,
    };
  }
  match = url.match(/moxfield\.com\/decks\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const id = match[1];
    return {
      provider: 'moxfield',
      deckId: id,
      apiUrl: `https://api.moxfield.com/v2/decks/all/${id}/`,
      handoffUrl: `https://moxfield.com/decks/${id}`,
      handoffIsText: false,
    };
  }
  match = url.match(/deckstats\.net\/decks\/(\d+\/[a-zA-Z0-9_-]+)/);
  if (match) {
    const path = match[1];
    const apiUrl = `https://deckstats.net/decks/${path}?include_comments=1&export_mtgarena=1`;
    return { provider: 'deckstats', deckId: path, apiUrl, handoffUrl: apiUrl, handoffIsText: true };
  }
  return null;
}

// ---------- Plain lists (DeckList::writeToString_Plain) ----------

function zone(cards: readonly DeckCard[], category: DeckCard['category']): DeckCard[] {
  return cards.filter((c) => c.category === category);
}

/**
 * `DeckList::writeToString_Plain(prefixSideboardCards, slashTappedOutSplitCards)`:
 * one `N Name` line per row, sideboard rows optionally prefixed `SB: `, and
 * split-card `//` optionally written as TappedOut's `/`.
 */
export function plainDeckText(
  cards: readonly DeckCard[],
  { prefixSideboard = true, slashSplitCards = false }: { prefixSideboard?: boolean; slashSplitCards?: boolean } = {},
): string {
  return [...zone(cards, 'main'), ...zone(cards, 'sideboard')]
    .map((c) => {
      const name = slashSplitCards ? c.name.replace(/\/\//g, '/') : c.name;
      const prefix = prefixSideboard && c.category === 'sideboard' ? 'SB: ' : '';
      return `${prefix}${c.quantity} ${name}\n`;
    })
    .join('');
}

// ---------- decklist.org / decklist.xyz (DeckLoader::exportDeckToDecklist) ----------

export type DecklistSite = 'decklist.org' | 'decklist.xyz';

/** `N Name (SET) num` — `toDecklistExportString`. */
function decklistLine(c: DeckCard): string {
  let line = `${c.quantity} ${c.name}`;
  if (c.set) {
    line += ` (${c.set.toUpperCase()})`;
  }
  if (c.collectorNumber) {
    line += ` ${c.collectorNumber}`;
  }
  return line;
}

/** The decklist URL to open, or `null` for a deck with no cards (desktop's error). */
export function decklistExportUrl(deck: HydratedDeck, site: DecklistSite): string | null {
  const main = zone(deck.cards, 'main').map(decklistLine).join('\n');
  const side = zone(deck.cards, 'sideboard').map(decklistLine).join('\n');
  if (!main && !side) {
    return null;
  }
  return `https://www.${site}/?deckmain=${encodeURIComponent(main)}&deckside=${encodeURIComponent(side)}`;
}

// ---------- Analyze (DeckStatsInterface / TappedOutInterface) ----------

export interface FormPost {
  action: string;
  fields: Record<string, string>;
}

/** Both analyzers send only cards the card database knows (`copyDeckWithoutTokens`). */
function knownCards(deck: HydratedDeck): DeckCard[] {
  return deck.cards.filter((c) => c.lookupSource !== 'unknown');
}

/** `DeckStatsInterface::getAnalyzeRequestData`: the plain list and the title. */
export function deckstatsAnalyzeForm(deck: HydratedDeck): FormPost {
  return {
    action: 'https://deckstats.net/index.php',
    fields: { deck: plainDeckText(knownCards(deck)), decktitle: deck.name },
  };
}

/** `TappedOutInterface::getAnalyzeRequestData`: name, mainboard, sideboard. */
export function tappedOutAnalyzeForm(deck: HydratedDeck): FormPost {
  const plain = (category: DeckCard['category']) =>
    plainDeckText(zone(knownCards(deck), category), { prefixSideboard: false, slashSplitCards: true });
  return {
    action: 'https://tappedout.net/mtg-decks/paste/',
    fields: { name: deck.name, mainboard: plain('main'), sideboard: plain('sideboard') },
  };
}

// ---------- Print (DeckLoader::printDeckList) ----------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A printable page laid out like desktop's print: the deck name, its
 * comments, then each zone as a two-column `count | name` table.
 */
export function deckPrintHtml(deck: HydratedDeck, zoneLabels: Record<DeckCard['category'], string>): string {
  const zones = (['main', 'sideboard'] as const)
    .map((category) => ({ label: zoneLabels[category], cards: zone(deck.cards, category) }))
    .filter((z) => z.cards.length > 0)
    .map((z) => [
      '<hr>',
      `<h2>${escapeHtml(z.label)}</h2>`,
      '<table>',
      ...z.cards.map((c) => `<tr><td class="n">${c.quantity}</td><td>${escapeHtml(c.name)}</td></tr>`),
      '</table>',
    ].join(''))
    .join('');
  const description = deck.meta.description ? `<p>${escapeHtml(deck.meta.description)}</p>` : '';
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${escapeHtml(deck.name)}</title>`,
    '<style>body{font-family:serif;margin:2em}h1{font-size:16pt}h2{font-size:14pt;margin:.6em 0 .2em}',
    'p{font-size:12pt}table{border-collapse:collapse;font-size:9pt}td{padding:0 .5em 0 0}td.n{text-align:right}</style>',
    '</head><body>',
    `<h1>${escapeHtml(deck.name)}</h1>`,
    description,
    zones,
    '</body></html>',
  ].join('');
}
