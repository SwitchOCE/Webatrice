// "View related cards", "Token: …" and transform items for a card's related
// cards, built from card-catalog lookups (refactor plan PB-09). Ports desktop
// addRelatedCardView / addRelatedCardActions (card_menu.cpp:371-479); the
// items fire the caller's handlers and never construct a request themselves.

import type { MenuShortcut } from '@app/feature-widgets/shortcuts';
import type { LookupCardFace, LookupResult, RelatedCardRef } from '@app/services';
import type { TFunction } from 'i18next';

import type { CreateTokenRequest } from '../../ui/PlayerBoard/playerBoard.types';
import type { ContextMenuItem } from '../ContextMenu/ContextMenu';

/**
 * The "View related cards" submenu, led by its separator. Ports desktop
 * addRelatedCardView (card_menu.cpp:371-406): one item per relation
 * (related and reverse-related alike, in list order), offered only when at
 * least one relation resolves in the card database; empty otherwise. An item
 * shows that card in the card-info pane (desktop's cardInfoRequested) and
 * sends nothing.
 */
export function buildRelatedViewItems(
  t: TFunction,
  related: readonly RelatedCardRef[],
  resolvable: (name: string) => boolean,
  onView: (ref: RelatedCardRef) => void,
): ContextMenuItem[] {
  if (!related.some((ref) => resolvable(ref.name))) {
    return [];
  }
  return [
    { divider: true },
    {
      label: t('CardMenu.viewRelated'),
      submenu: related.map((ref) => ({ label: ref.name, onClick: () => onView(ref) })),
    },
  ];
}

/** One "Token: …" action: its label and the Command_CreateToken requests it sends. */
interface RelatedTokenAction {
  label: (t: TFunction) => string;
  requests: CreateTokenRequest[];
}

/**
 * The "Token: …" action for one related card. Ports Cockatrice's
 * addRelatedCardActions (card_menu.cpp:407-479):
 *   - Label format:
 *       count omitted / count="1" → "Token: <pt> <name>"
 *       count="x"                 → "Token: X <pt> <name>"
 *       count=N (numeric > 1)     → "Token: Nx <pt> <name>"
 *   - `pt` is dropped from the label when the token's own Scryfall
 *     record has no power/toughness (spell tokens, transform-back
 *     non-creatures).
 *   - The action still exists when the token's Scryfall lookup is
 *     `unknown` — the parent card's `related` entry is enough to
 *     fire Command_CreateToken with just the name; a stale-image
 *     fallback is better than a missing item.
 *   - `count=N` sends N Command_CreateToken calls in a row
 *     (Cockatrice's actCreateRelatedCard loop). `count="x"` sends
 *     one — Cockatrice prompts the user for a number; that dialog
 *     is a follow-up. A `persistent` attribute inverts the
 *     default destroy-on-zone-change (rare — most tokens vanish
 *     off the battlefield).
 *   - With "Annotate card text on tokens" (`annotate`), each token
 *     carries its rules text as its annotation (PlayerActions::createCard).
 */
/**
 * Whether a cards.xml relation attribute is set. Desktop's parser checks
 * only that `attach`, `exclude` and `persistent` are present
 * (cockatrice_xml_4.cpp:403-414), so `exclude=""` counts.
 */
const isSet = (attribute: string | undefined): boolean => attribute !== undefined;

function relatedTokenAction(ref: RelatedCardRef, tok: LookupResult | undefined, annotate: boolean): RelatedTokenAction {
  const tokPT = tok?.power != null && tok.toughness != null
    ? `${tok.power}/${tok.toughness}`
    : undefined;
  const tokColor = tok?.colors && tok.colors.length > 0
    ? tok.colors.length > 1
      ? 'm'
      : tok.colors[0].toLowerCase()
    : '';
  const tokProviderId = tok?.printings?.[0]?.scryfallId;
  const countPrefix = ref.count === 'x'
    ? 'X '
    : ref.count && /^\d+$/.test(ref.count) && Number(ref.count) > 1
      ? `${ref.count}x `
      : '';
  const ptPart = tokPT ? `${tokPT} ` : '';
  const { variable, count } = relationCount(ref);
  const fireCount = variable ? 1 : count;
  const request: CreateTokenRequest = {
    name: tok?.name ?? ref.name,
    color: tokColor,
    pt: tokPT ?? '',
    annotation: annotate ? tok?.text ?? '' : '',
    destroyOnZoneChange: !isSet(ref.persistent),
    faceDown: false,
    providerId: tokProviderId,
  };
  return {
    label: (t) => t('CardMenu.token', { description: `${countPrefix}${ptPart}${ref.name}` }),
    requests: Array.from({ length: fireCount }, () => request),
  };
}

const actionItem = (t: TFunction, action: RelatedTokenAction, onCreateToken: CreateTokenHandler | undefined): ContextMenuItem => ({
  label: action.label(t),
  onClick: () => {
    if (onCreateToken) {
      action.requests.forEach((request) => onCreateToken(request));
    }
  },
});

/**
 * Build "Token: …" menu items for a card's related list (see
 * relatedTokenAction). Shared by the own-card, opponent-card and hand
 * menus so they label and dispatch identically.
 */
export function buildRelatedTokenItems(
  t: TFunction,
  related: readonly RelatedCardRef[],
  tokenMeta: ReadonlyMap<string, LookupResult>,
  onCreateToken: CreateTokenHandler | undefined,
  annotate = false,
): ContextMenuItem[] {
  return related.map((ref) => actionItem(t, relatedTokenAction(ref, tokenMeta.get(ref.name), annotate), onCreateToken));
}

/** The seat's create-token command. */
export type CreateTokenHandler = (request: CreateTokenRequest) => void;

/**
 * Scryfall layouts we treat as transformable (present two physical
 * faces the user can flip between via Command_CreateToken.
 * TRANSFORM_INTO). Adventure / split / flip layouts DON'T qualify —
 * they have two "faces" in the data model but the physical card
 * doesn't flip in play. Reversible cards (Zendikar Rising) DO
 * qualify: both faces are legal at once and the player can decide
 * which one is "up."
 */
const TRANSFORMABLE_LAYOUTS = new Set(['transform', 'modal_dfc', 'reversible_card']);

type TransformMeta = { layout?: string; faces?: LookupCardFace[] } | undefined;

/**
 * "Token: Transform into '<back-face>'" for DFC-family cards. Ports
 * Cockatrice's addRelatedCardActions transform branch
 * (player_actions.cpp:1198-1206): Command_CreateToken with
 * target_card_id + target_mode=TRANSFORM_INTO, which the server
 * processes as "replace the source card with the new token."
 *
 * Null when the card isn't a transformable layout, when the Scryfall
 * face data hasn't landed yet, or when the source card has no numeric
 * id (optimistic mock-id cards can't be targeted). The transform
 * target is the one non-front face. With `annotate`, the new face carries
 * its rules text as its annotation, as a related token does.
 */
function transformAction(
  parentMeta: TransformMeta,
  sourceCardId: number | undefined,
  parentName: string,
  annotate: boolean,
): RelatedTokenAction | null {
  // Servatrice numbers cards from 0 (server_player.cpp newCardId), so 0 is a real id.
  if (!parentMeta || sourceCardId == null) {
    return null;
  }
  if (!parentMeta.layout || !TRANSFORMABLE_LAYOUTS.has(parentMeta.layout)) {
    return null;
  }
  const faces = parentMeta.faces ?? [];
  if (faces.length < 2) {
    return null;
  }
  // Determine which face is currently showing. Simplest heuristic:
  // Scryfall's `card_faces[0]` is the front. The parent card's
  // display name here is `parentName` (whichever face the server
  // currently reports); if it matches the front-face name, target
  // the back. Otherwise target the front. Handles the case where
  // an already-transformed card should flip back.
  const front = faces[0];
  const back = faces[1];
  const target = parentName === front.name ? back : front;
  const targetPT = target.power != null && target.toughness != null
    ? `${target.power}/${target.toughness}`
    : undefined;
  const targetColor = target.colors && target.colors.length > 0
    ? target.colors.length > 1
      ? 'm'
      : target.colors[0].toLowerCase()
    : '';
  return {
    label: (t) => t('CardMenu.transform', { name: target.name }),
    requests: [{
      name: target.name,
      color: targetColor,
      pt: targetPT ?? '',
      annotation: annotate ? target.text ?? '' : '',
      destroyOnZoneChange: false,
      faceDown: false,
      targetCardId: sourceCardId,
      targetMode: 'transform_into',
    }],
  };
}

/** The "Token: Transform into …" item for a double-faced card (transformAction); [] otherwise. */
export function buildTransformItems(
  t: TFunction,
  parentMeta: TransformMeta,
  sourceCardId: number | undefined,
  parentName: string,
  onCreateToken: CreateTokenHandler | undefined,
  annotate = false,
): ContextMenuItem[] {
  const action = onCreateToken ? transformAction(parentMeta, sourceCardId, parentName, annotate) : null;
  return action ? [actionItem(t, action, onCreateToken)] : [];
}

/** A battlefield card's related cards, as the token actions read them. */
export interface RelatedCardSource {
  related: readonly RelatedCardRef[];
  tokenMeta: ReadonlyMap<string, LookupResult>;
  parentMeta: TransformMeta;
  /** The card's server id; undefined for an optimistic card. */
  sourceCardId: number | undefined;
  parentName: string;
  /** Desktop's "Annotate card text on tokens": each token carries its rules text. */
  annotate?: boolean;
}

/**
 * A relation's count as desktop's cards.xml parser reads it
 * (cockatrice_xml_4.cpp:388-400): "x" or "x=N" is a variable count the user
 * is asked for (default N, else 1); a number is a fixed count; anything
 * below 1 counts as 1.
 */
export function relationCount(ref: Pick<RelatedCardRef, 'count'>): { variable: boolean; count: number } {
  const raw = ref.count;
  if (raw == null) {
    return { variable: false, count: 1 };
  }
  const variable = raw.startsWith('x');
  const parsed = parseInt(raw.startsWith('x=') ? raw.slice(2) : variable ? '' : raw, 10);
  return { variable, count: Number.isFinite(parsed) && parsed >= 1 ? parsed : 1 };
}

/** What "Create all related tokens" does (see createAllRelated). */
export interface CreateAllRelated {
  /** Command_CreateToken requests to send now. */
  requests: CreateTokenRequest[];
  /**
   * A variable-count relation ("x"), which desktop runs through its related
   * card dialog: ask how many (default `defaultCount`), then send `request`
   * that many times.
   */
  prompt?: { request: CreateTokenRequest; defaultCount: number };
  /**
   * What "Create another token" repeats afterwards: the first relation run,
   * unless it attaches (desktop setLastToken when getCanCreateAnother,
   * player_actions.cpp:1053-1061), built from its card (repeatTokenRequest).
   */
  lastToken?: CreateTokenRequest;
}

/**
 * The token "Create another token" repeats after a related token, as desktop
 * setLastTokenInfo (player_actions.cpp:929-943) rebuilds it from the token's
 * card rather than from the relation: its first color, its printed P/T, its
 * rules text when annotating, and always destroyed on a zone change. The
 * printing is the one the token items use (desktop sends the user's printing
 * override, which the web client does not have).
 */
function repeatTokenRequest(ref: RelatedCardRef, tok: LookupResult | undefined, annotate: boolean): CreateTokenRequest {
  return {
    name: tok?.name ?? ref.name,
    color: tok?.colors?.[0]?.toLowerCase() ?? '',
    pt: tok?.power != null && tok.toughness != null ? `${tok.power}/${tok.toughness}` : '',
    annotation: annotate ? tok?.text ?? '' : '',
    destroyOnZoneChange: true,
    faceDown: false,
    providerId: tok?.printings?.[0]?.scryfallId,
  };
}

/**
 * What "Create all related tokens" (desktop aCreateRelatedTokens,
 * PlayerActions::actCreateAllRelatedCards, player_actions.cpp:977-1050)
 * does with a card's related actions:
 *   - exactly one related action (a transform included): run it as its
 *     menu item does, through the count prompt when its count is "x";
 *   - else, of the relations neither marked `exclude` nor attaching:
 *     - exactly one: run that one, as above;
 *     - none (everything excluded): every relation that neither attaches
 *       nor asks for a count;
 *     - more: each of them that does not ask for a count.
 */
export function createAllRelated(source: RelatedCardSource): CreateAllRelated {
  const annotate = source.annotate ?? false;
  const repeatToken = (ref: RelatedCardRef) => repeatTokenRequest(ref, source.tokenMeta.get(ref.name), annotate);
  const runOne = (ref: RelatedCardRef): CreateAllRelated => {
    const { requests } = relatedTokenAction(ref, source.tokenMeta.get(ref.name), annotate);
    const { variable, count } = relationCount(ref);
    const lastToken = isSet(ref.attach) ? undefined : repeatToken(ref);
    return variable
      ? { requests: [], prompt: { request: requests[0], defaultCount: count }, lastToken }
      : { requests, lastToken };
  };
  const createEach = (refs: readonly RelatedCardRef[]): CreateAllRelated => {
    const created = refs.filter((ref) => !isSet(ref.attach) && !relationCount(ref).variable);
    return {
      requests: created.flatMap((ref) => relatedTokenAction(ref, source.tokenMeta.get(ref.name), annotate).requests),
      lastToken: created.length > 0 ? repeatToken(created[0]) : undefined,
    };
  };

  const transform = transformAction(source.parentMeta, source.sourceCardId, source.parentName, annotate);
  if (source.related.length + (transform ? 1 : 0) === 1) {
    return transform ? { requests: transform.requests } : runOne(source.related[0]);
  }
  // A transform attaches (attach="transform"), so it never counts here.
  const nonExcluded = source.related.filter((ref) => !isSet(ref.exclude) && !isSet(ref.attach));
  if (nonExcluded.length === 1) {
    return runOne(nonExcluded[0]);
  }
  return createEach(nonExcluded.length === 0 ? source.related : nonExcluded);
}

/**
 * The card menu's "Token: …" items: one per related card, "Token:
 * Transform into …" for a double-faced card, then "All tokens" when
 * there is more than one (desktop addRelatedCardActions). The create-all
 * shortcut hint sits on whichever item runs it: the only item, or "All
 * tokens".
 */
export function buildRelatedActionItems(
  t: TFunction,
  source: RelatedCardSource,
  onCreateToken: CreateTokenHandler | undefined,
  createAllShortcut: MenuShortcut,
  onCreateAll: () => void,
): ContextMenuItem[] {
  const items = [
    ...buildRelatedTokenItems(t, source.related, source.tokenMeta, onCreateToken, source.annotate),
    ...buildTransformItems(t, source.parentMeta, source.sourceCardId, source.parentName, onCreateToken, source.annotate),
  ];
  const shortcut = createAllShortcut.shortcut ? createAllShortcut : null;
  // The only item is what create-all runs, so it runs it the same way (the
  // count prompt for an "x" relation).
  if (items.length === 1) {
    return [{ ...items[0], ...shortcut, onClick: onCreateAll }];
  }
  if (items.length === 0) {
    return items;
  }
  return [
    ...items,
    {
      label: t('CardMenu.allTokens'),
      ...shortcut,
      onClick: onCreateAll,
    },
  ];
}
