import type { DeckCard } from './types';

/**
 * Deck tags and banner card — desktop `DeckList::Metadata` (`<tags>` of
 * `<tag>` children, `<bannerCard providerId=…>`), edited from the deck dock
 * (`DeckEditorDeckDockWidget`) and the tag dialog (`DeckPreviewTagDialog`).
 *
 * The deck keeps `<tags>` as raw XML so children this client doesn't know
 * survive a round trip; only the `<tag>` children are read and rewritten.
 */

/** The `<tag>` texts of a stored `<tags>` element, in order. */
export function readDeckTags(tagsXml: string | undefined): string[] {
  const root = parseTags(tagsXml);
  if (!root) {
    return [];
  }
  return Array.from(root.children)
    .filter((el) => el.tagName === 'tag')
    .map((el) => el.textContent ?? '')
    .filter((tag) => tag.length > 0);
}

/**
 * `tagsXml` with its `<tag>` children replaced by `tags`, keeping any other
 * children where they were. `undefined` when nothing is left to store.
 */
export function writeDeckTags(tagsXml: string | undefined, tags: readonly string[]): string | undefined {
  const root = parseTags(tagsXml) ?? new DOMParser().parseFromString('<tags/>', 'application/xml').documentElement;
  const doc = root.ownerDocument;
  for (const el of Array.from(root.children)) {
    if (el.tagName === 'tag') {
      root.removeChild(el);
    }
  }
  for (const tag of tags) {
    const el = doc.createElement('tag');
    el.textContent = tag;
    root.appendChild(el);
  }
  if (root.children.length === 0) {
    return undefined;
  }
  return new XMLSerializer().serializeToString(root);
}

function parseTags(tagsXml: string | undefined): Element | null {
  if (!tagsXml?.trim()) {
    return null;
  }
  const doc = new DOMParser().parseFromString(tagsXml, 'application/xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root?.tagName !== 'tags') {
    return null;
  }
  return root;
}

export type TagValidation = 'ok' | 'empty' | 'duplicate';

/** Desktop `DeckPreviewTagDialog::addTag`: no empty and no repeated tags. */
export function validateNewTag(tag: string, current: readonly string[]): TagValidation {
  const trimmed = tag.trim();
  if (!trimmed) {
    return 'empty';
  }
  return current.includes(trimmed) ? 'duplicate' : 'ok';
}

/**
 * Tags to offer when adding one: desktop's default list, then tags from
 * elsewhere, minus the ones the deck already has (`DeckPreviewTagDialog`
 * merges defaults + known + active, deduplicated).
 */
export function tagSuggestions(active: readonly string[], known: readonly string[] = []): string[] {
  const seen = new Set(active);
  const out: string[] = [];
  for (const tag of [...DEFAULT_DECK_TAGS, ...known]) {
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

/** A card that can be the deck's banner: desktop `CardRef` (name + printing). */
export interface BannerCandidate {
  name: string;
  providerId?: string;
}

/**
 * Desktop `DeckEditorDeckDockWidget::updateBannerCardComboBox`: every
 * distinct card (name + printing) in the deck, sorted by name.
 */
export function bannerCandidates(cards: readonly DeckCard[]): BannerCandidate[] {
  const byKey = new Map<string, BannerCandidate>();
  for (const card of cards) {
    const key = `${card.name}\u0000${card.scryfallId ?? ''}`;
    if (!byKey.has(key)) {
      byKey.set(key, { name: card.name, providerId: card.scryfallId });
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Desktop's default tag list (`VisualDeckStorageSettings` defaults). */
export const DEFAULT_DECK_TAGS: readonly string[] = [
  // Strategies
  '🏃️ Aggro', '🧙‍️ Control', '⚔️ Midrange', '🌀 Combo', '🪓 Mill', '🔒 Stax', '🗺️ Landfall', '🛡️ Pillowfort',
  '🌱 Ramp', '⚡ Storm', '💀 Aristocrats', '☠️ Reanimator', '👹 Sacrifice', '🔥 Burn', '🌟 Lifegain',
  '🔮 Spellslinger', '👥 Tokens', '🎭 Blink', '⏳ Time Manipulation', '🌍 Domain', '💫 Proliferate', '📜 Saga',
  '🎲 Chaos', '🪄 Auras', '🔫 Pingers',
  // Themes
  '👑 Monarch', '🚀 Vehicles', '💉 Infect', '🩸 Madness', '🌀 Morph',
  // Card types
  '⚔️ Creature', '💎 Artifact', '🌔 Enchantment', '📖 Sorcery', '⚡ Instant', '🌌 Planeswalker', '🌏 Land', '🪄 Aura',
  // Kindred types
  '🐉 Kindred', '🧙 Humans', '⚔️ Soldiers', '🛡️ Knights', '🎻 Bards', '🧝 Elves', '🌲 Dryads', '😇 Angels',
  '🎩 Wizards', '🧛 Vampires', '🦴 Skeletons', '💀 Zombies', '👹 Demons', '👾 Eldrazi', '🐉 Dragons', '🐠 Merfolk',
  '🦁 Cats', '🐺 Wolves', '🐺 Werewolves', '🦇 Bats', '🐀 Rats', '🦅 Birds', '🦗 Insects', '🍄 Fungus',
  '🐚 Sea Creatures', '🐗 Boars', '🦊 Foxes', '🦄 Unicorns', '🐘 Elephants', '🐻 Bears', '🦏 Rhinos', '🦂 Scorpions',
];
