import { cleanScryfallName, scryfallCardUrl, scryfallNamedUrl } from './client';

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
  cmc?: number;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: { small?: string; normal?: string; large?: string };
}

export interface DetailTarget {
  name: string;
  scryfallId?: string;
}

export function detailTargetKey(target: DetailTarget): string {
  return target.scryfallId ?? `name:${target.name}`;
}

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
