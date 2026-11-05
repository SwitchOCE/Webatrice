import {
  cleanScryfallName, dexieService, fetchScryfallDetail, fetchTokenCard, lookupCard, lookupCards, preferredPrinting,
  onCardDataPreferencesRefreshed, type CardDataPreferences, type LookupResult, type Token,
} from '@app/services';
import { onSessionEnd, sessionGeneration } from '../../../services/session';
import { scryfallToLookup } from '../../../services/cards/catalog/scryfallCardMapper';

export interface GameImageCard {
  name: string;
  scryfallId?: string;
  imageUri?: string;
}

export interface GameImageLookup {
  card: LookupResult;
  token?: Token;
  imageCard?: LookupResult;
}

const pending = new Map<string, Promise<GameImageLookup>>();
const successful = new Map<string, GameImageLookup>();
const priming = new Map<string, Promise<void>>();
const tokenImages = new Map<string, Promise<LookupResult | null>>();
const printingImages = new Map<string, Promise<LookupResult | undefined>>();
interface TokenIndex {
  exact: Map<string, Token>;
  cleaned: Map<string, Token>;
}
let tokenIndex: Promise<TokenIndex> | undefined;
let preferences: CardDataPreferences | undefined;
let lookupGeneration = 0;
onCardDataPreferencesRefreshed((next) => {
  if (preferences && preferences !== next) {
    lookupGeneration++;
    successful.clear();
    pending.clear();
    priming.clear();
  }
  preferences = next;
});
onSessionEnd(() => {
  pending.clear();
  successful.clear();
  priming.clear();
  tokenImages.clear();
  printingImages.clear();
  tokenIndex = undefined;
});

const exactName = (name: string) => name.trim().normalize('NFC').toLowerCase();
const imageName = (name: string) => cleanScryfallName(name).normalize('NFC').toLowerCase();
const validWireId = (id?: string) => id && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ? id : undefined;

export function primeGameCards(names: readonly string[]): Promise<void> {
  const unique = new Map(names.filter((name) => name.trim()).map((name) => [exactName(name), name]));
  const waiting = [...new Set([...unique.keys()].flatMap((key) => priming.get(key) ?? []))];
  const needed = [...unique].filter(([key]) => !successful.has(key) && !priming.has(key));
  if (needed.length === 0) {
    return Promise.all(waiting).then(() => {});
  }
  const generation = sessionGeneration();
  const revision = lookupGeneration;
  const request = Promise.all([
    lookupCards(needed.map(([, name]) => name)), readTokenIndex().catch(() => undefined),
  ]).then(([results, index]) => {
    if (generation === sessionGeneration() && revision === lookupGeneration && index) {
      for (const [key, name] of needed) {
        const card = results.get(name);
        if (card?.found || card?.notFound) {
          successful.set(key, gameLookup(name, card, index));
        }
      }
    }
  }).catch(() => {}).finally(() => {
    for (const [key] of needed) {
      if (priming.get(key) === request) {
        priming.delete(key);
      }
    }
  });
  for (const [key] of needed) {
    priming.set(key, request);
  }
  return Promise.all([...waiting, request]).then(() => {});
}

function readTokenIndex(): Promise<TokenIndex> {
  if (tokenIndex) {
    return tokenIndex;
  }
  const request = dexieService.tokens.toArray().then((tokens: Token[]) => {
    const index: TokenIndex = { exact: new Map(), cleaned: new Map() };
    for (const token of tokens) {
      const exact = exactName(token.name.value);
      const cleaned = imageName(token.name.value);
      if (!index.exact.has(exact)) {
        index.exact.set(exact, token);
      }
      if (!index.cleaned.has(cleaned)) {
        index.cleaned.set(cleaned, token);
      }
    }
    return index;
  }).catch((error: unknown) => {
    if (tokenIndex === request) {
      tokenIndex = undefined;
    }
    throw error;
  });
  tokenIndex = request;
  return request;
}

export function lookupGameCard(name: string): Promise<GameImageLookup> {
  const key = exactName(name);
  const cached = successful.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }
  const existing = pending.get(key);
  if (existing) {
    return existing;
  }
  const generation = sessionGeneration();
  const revision = lookupGeneration;
  const request = Promise.all([
    Promise.resolve().then(async () => {
      await priming.get(key);
      return successful.get(key)?.card ?? lookupCard(name);
    }),
    readTokenIndex().catch(() => undefined),
  ]).then(([card, index]) => {
    const lookup = gameLookup(name, card, index);
    if ((card.found || card.notFound) && index && generation === sessionGeneration() && revision === lookupGeneration) {
      successful.set(key, lookup);
    }
    return lookup;
  }).finally(() => {
    if (pending.get(key) === request) {
      pending.delete(key);
    }
  });
  pending.set(key, request);
  return request;
}

function gameLookup(name: string, card: LookupResult, index?: TokenIndex): GameImageLookup {
  const isToken = cleanScryfallName(name) !== name.trim() || /\bToken\b/i.test(card.typeLine ?? '');
  return { card, token: index?.exact.get(exactName(name)) ?? (isToken ? index?.cleaned.get(imageName(name)) : undefined) };
}

export async function resolveGameImagePrinting(
  lookup: GameImageLookup, wireId?: string, name = lookup.card.name,
): Promise<GameImageLookup> {
  const wirePrinting = validWireId(wireId);
  const token = cleanScryfallName(name) !== name.trim() || /\bToken\b/i.test(lookup.card.typeLine ?? '');
  const tokenRecord = lookup.card.layout === 'token' || lookup.card.layout === 'double_faced_token'
    || (lookup.card.layout !== 'front_card' && /\bToken\b/i.test(lookup.card.typeLine ?? ''));
  if (!wirePrinting && !lookup.token && token && !tokenRecord) {
    const key = imageName(name);
    let request = tokenImages.get(key);
    if (!request) {
      request = fetchTokenCard(name).then((card) => card ? scryfallToLookup(card) : null);
      tokenImages.set(key, request);
      void request.catch(() => {
        if (tokenImages.get(key) === request) {
          tokenImages.delete(key);
        }
      });
    }
    const imageCard = await request;
    if (imageCard) {
      return { ...lookup, imageCard };
    }
    return { ...lookup, imageCard: { found: false, source: 'unknown', name, printings: [] } };
  }
  const sets = tokenPrintings(lookup.token);
  const id = wirePrinting || sets.find((printing) => printing.uuid)?.uuid || preferredPrinting(lookup.card)?.scryfallId;
  const faces = (lookup.imageCard ?? lookup.card).faces;
  const face = faces?.findIndex((entry) => imageName(entry.name) === imageName(name)) ?? -1;
  const identity = face > 0 ? imageIdentity(faces?.[face].imageUri) : undefined;
  if (!id || (!wirePrinting && sets.some((printing) => printing.picURL || printing.picurl)) || !identity || identity.id === id) {
    return lookup;
  }
  let request = printingImages.get(id);
  if (!request) {
    request = fetchScryfallDetail(id, lookup.card.name).then((card) => card
      ? scryfallToLookup({ id: card.id, name: card.name, card_faces: card.card_faces }) : undefined).catch(() => undefined);
    printingImages.set(id, request);
  }
  const imageCard = await request;
  if (!imageCard) {
    if (printingImages.get(id) === request) {
      printingImages.delete(id);
    }
    throw new Error('Card image printing lookup failed');
  }
  return { ...lookup, imageCard };
}

function tokenPrintings(token?: Token) {
  const sets = token?.set;
  return sets ? Array.isArray(sets) ? sets : [sets] : [];
}

function imageIdentity(uri?: string): { id: string; side: string } | undefined {
  if (!uri) {
    return undefined;
  }
  const cdn = /^https:\/\/cards\.scryfall\.io\/[^/]+\/(front|back)\/[^/]+\/[^/]+\/([^/.?]+)\.[^?]+/.exec(uri);
  if (cdn) {
    return { id: cdn[2], side: cdn[1] };
  }
  const api = /^https:\/\/api\.scryfall\.com\/cards\/([^/?]+)\?/.exec(uri);
  if (api && api[1] !== 'named') {
    return { id: api[1], side: new URL(uri).searchParams.get('face') === 'back' ? 'back' : 'front' };
  }
  return undefined;
}

export function gameCardImageUrl(target: GameImageCard, lookup?: GameImageLookup): string | null {
  const wireId = validWireId(target.scryfallId);
  const printings = wireId ? [] : tokenPrintings(lookup?.token);
  const picture = printings.find((printing) => printing.picURL || printing.picurl);
  const localUri = picture?.picURL || picture?.picurl;
  const localId = printings.find((printing) => printing.uuid)?.uuid;
  const imageCard = lookup?.imageCard ?? lookup?.card;
  const face = imageCard?.faces?.find((entry) => imageName(entry.name) === imageName(target.name));
  const faceUri = lookup?.imageCard ? face?.imageUri : target.imageUri ?? face?.imageUri;
  const uri = localUri ?? faceUri;
  const identity = imageIdentity(uri);
  if (!wireId && uri && !identity && !uri.startsWith('https://api.scryfall.com/')) {
    return uri;
  }
  const id = wireId ?? (localUri ? identity?.id : undefined) ?? localId
    ?? (imageCard && preferredPrinting(imageCard)?.scryfallId) ?? identity?.id;
  if (!id) {
    return null;
  }
  const side = identity?.id === id ? identity.side : 'front';
  return `https://cards.scryfall.io/large/${side}/${id[0]}/${id[1]}/${id}.jpg`;
}

export function gameCardImageFallback(url: string | null): string | null {
  const identity = imageIdentity(url ?? undefined);
  return url?.startsWith('https://cards.scryfall.io/') && identity
    ? `https://api.scryfall.com/cards/${encodeURIComponent(identity.id)}?format=image&version=large&face=${identity.side}`
    : null;
}
