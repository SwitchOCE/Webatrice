import { cleanScryfallName, scryfallCardUrl, scryfallNamedUrl } from './client';

/**
 * A card's full Scryfall record, as the card-detail views (the deck
 * editor's detail dialog, the game's big preview and right-rail preview)
 * fetch and render it, and the policy for which face a view shows.
 */

/** Scryfall fields the detail views render. */
export interface ScryfallDetail {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  set?: string;
  collector_number?: string;
  image_uris?: { small?: string; normal?: string; large?: string };
  card_faces?: Array<ScryfallDetailFace>;
  /** Scryfall `all_parts` — tokens, meld pieces, combo pieces. Powers the
   *  "Related" links rendered by CardRelatedLinks. */
  all_parts?: Array<{
    id?: string;
    name?: string;
    component?: string;
  }>;
}

export interface ScryfallDetailFace {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  mana_cost?: string;
  /** Face-level CMC. Scryfall only populates this on MDFCs and reversible
   *  cards — transform DFCs put CMC on the top-level record only, and
   *  their back face has no mana cost at all. */
  cmc?: number;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: { small?: string; normal?: string; large?: string };
}

/** The card a detail fetch targets: an exact printing when known, else a name. */
export interface DetailTarget {
  name: string;
  scryfallId?: string;
}

/** Cache / refetch key for a detail target. */
export function detailTargetKey(target: DetailTarget): string {
  return target.scryfallId ?? `name:${target.name}`;
}

/**
 * Fetch a card's full Scryfall record: by id when known, else by exact
 * name (a trailing "Token" suffix stripped). `null` on HTTP or network
 * failure; an abort is rethrown so the caller can ignore it.
 */
export async function fetchScryfallDetail(
  scryfallId: string | undefined,
  name: string,
  signal?: AbortSignal,
): Promise<ScryfallDetail | null> {
  try {
    const url = scryfallId ? scryfallCardUrl(scryfallId) : scryfallNamedUrl(cleanScryfallName(name));
    const res = await fetch(url, { signal });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as ScryfallDetail;
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') {
      throw e;
    }
    return null;
  }
}

/**
 * The face to show for `activeName`, so clicking "Other face" on a DFC
 * flips to the back face's data. First match wins:
 *   1. exact (case-insensitive);
 *   2. exact after stripping a "Token" suffix (all_parts names and face
 *      names disagree on it);
 *   3. face name contained in the active name (chip more specific);
 *   4. active name contained in the face name (chip more general);
 *   5. the first face.
 * The substring steps catch double-faced tokens whose all_parts names
 * don't line up with the record's faces. `undefined` for single-faced
 * cards.
 */
export function selectCardFace(
  detail: ScryfallDetail | null,
  activeName: string,
): ScryfallDetailFace | undefined {
  const faces = detail?.card_faces;
  if (!faces || faces.length === 0) {
    return undefined;
  }
  const stripToken = (s: string) => cleanScryfallName(s).trim();
  const active = activeName.toLowerCase();
  const activeStripped = stripToken(activeName).toLowerCase();
  return (
    faces.find((f) => f.name?.toLowerCase() === active)
    ?? faces.find((f) => f.name && stripToken(f.name).toLowerCase() === activeStripped)
    ?? faces.find((f) => f.name && active.includes(f.name.toLowerCase()))
    ?? faces.find((f) => f.name?.toLowerCase().includes(active))
    ?? faces[0]
  );
}
