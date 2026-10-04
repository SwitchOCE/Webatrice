// "View related cards", "Token: …" and transform items for a card's related
// cards, built from card-catalog lookups (refactor plan PB-09). Ports desktop
// addRelatedCardView / addRelatedCardActions (card_menu.cpp:371-479); the
// items fire the caller's handlers and never construct a request themselves.

import type { LookupCardFace, LookupResult, RelatedCardRef } from '@app/services';

import type { CreateTokenRequest } from '../../ui/PlayerBoard/playerBoard.types';
import type { CardMenuItem } from './cardContextMenu.model';

/**
 * The "View related cards" submenu, led by its separator. Ports desktop
 * addRelatedCardView (card_menu.cpp:371-406): one item per relation
 * (related and reverse-related alike, in list order), offered only when at
 * least one relation resolves in the card database; empty otherwise. An item
 * shows that card in the card-info pane (desktop's cardInfoRequested) and
 * sends nothing.
 */
export function buildRelatedViewItems(
  related: readonly RelatedCardRef[],
  resolvable: (name: string) => boolean,
  onView: (ref: RelatedCardRef) => void,
): CardMenuItem[] {
  if (!related.some((ref) => resolvable(ref.name))) {
    return [];
  }
  return [
    { divider: true },
    {
      label: 'View related cards',
      submenu: related.map((ref) => ({ label: ref.name, onClick: () => onView(ref) })),
    },
  ];
}

/** One "Token: …" action: its label and the Command_CreateToken requests it sends. */
interface RelatedTokenAction {
  label: string;
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
 *     is a follow-up. `persistent="persistent"` inverts the
 *     default destroy-on-zone-change (rare — most tokens vanish
 *     off the battlefield).
 *   - With "Annotate card text on tokens" (`annotate`), each token
 *     carries its rules text as its annotation (PlayerActions::createCard).
 */
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
  const fireCount =
    ref.count && /^\d+$/.test(ref.count) ? Number(ref.count) : 1;
  const request: CreateTokenRequest = {
    name: tok?.name ?? ref.name,
    color: tokColor,
    pt: tokPT ?? '',
    annotation: annotate ? tok?.text ?? '' : '',
    destroyOnZoneChange: ref.persistent !== 'persistent',
    faceDown: false,
    providerId: tokProviderId,
  };
  return {
    label: `Token: ${countPrefix}${ptPart}${ref.name}`,
    requests: Array.from({ length: fireCount }, () => request),
  };
}

const actionItem = (action: RelatedTokenAction, onCreateToken: CreateTokenHandler | undefined): CardMenuItem => ({
  label: action.label,
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
  related: readonly RelatedCardRef[],
  tokenMeta: ReadonlyMap<string, LookupResult>,
  onCreateToken: CreateTokenHandler | undefined,
  annotate = false,
): CardMenuItem[] {
  return related.map((ref) => actionItem(relatedTokenAction(ref, tokenMeta.get(ref.name), annotate), onCreateToken));
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
    label: `Token: Transform into "${target.name}"`,
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
  parentMeta: TransformMeta,
  sourceCardId: number | undefined,
  parentName: string,
  onCreateToken: CreateTokenHandler | undefined,
  annotate = false,
): CardMenuItem[] {
  const action = onCreateToken ? transformAction(parentMeta, sourceCardId, parentName, annotate) : null;
  return action ? [actionItem(action, onCreateToken)] : [];
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
 * What "Create all related tokens" (desktop aCreateRelatedTokens,
 * PlayerActions::actCreateAllRelatedCards, player_actions.cpp:977-1062)
 * sends: the card's only related action when it has one, else every
 * related token that neither attaches (a transform included) nor asks
 * for a count ("x").
 */
export function createAllRelatedRequests(source: RelatedCardSource): CreateTokenRequest[] {
  const annotate = source.annotate ?? false;
  const tokens = source.related.map((ref) => ({ ref, action: relatedTokenAction(ref, source.tokenMeta.get(ref.name), annotate) }));
  const transform = transformAction(source.parentMeta, source.sourceCardId, source.parentName, annotate);
  const actions = [...tokens.map((t) => t.action), ...(transform ? [transform] : [])];
  if (actions.length === 1) {
    return actions[0].requests;
  }
  return tokens.filter(({ ref }) => !ref.attach && ref.count !== 'x').flatMap((t) => t.action.requests);
}

/**
 * The card menu's "Token: …" items: one per related card, "Token:
 * Transform into …" for a double-faced card, then "All tokens" when
 * there is more than one (desktop addRelatedCardActions). The create-all
 * shortcut hint sits on whichever item runs it: the only item, or "All
 * tokens".
 */
export function buildRelatedActionItems(
  source: RelatedCardSource,
  onCreateToken: CreateTokenHandler | undefined,
  createAllShortcut: string,
): CardMenuItem[] {
  const items = [
    ...buildRelatedTokenItems(source.related, source.tokenMeta, onCreateToken, source.annotate),
    ...buildTransformItems(source.parentMeta, source.sourceCardId, source.parentName, onCreateToken, source.annotate),
  ];
  const shortcut = createAllShortcut || undefined;
  if (items.length === 1) {
    return [{ ...items[0], shortcut }];
  }
  if (items.length === 0) {
    return items;
  }
  return [
    ...items,
    {
      label: 'All tokens',
      shortcut,
      onClick: () => {
        if (onCreateToken) {
          createAllRelatedRequests(source).forEach((request) => onCreateToken(request));
        }
      },
    },
  ];
}
