// "Token: …" and transform items for a card's related cards, built from
// card-catalog lookups (refactor plan PB-09). Ports desktop
// addRelatedCardActions (card_menu.cpp:407-479); the items fire the caller's
// create-token command and never construct a request themselves.

import type { LookupCardFace, LookupResult, RelatedCardRef } from '@app/services';

import type { CreateTokenRequest } from '../../ui/PlayerBoard/playerBoard.types';
import type { CardMenuItem } from './cardContextMenu.model';

/**
 * Build "Token: …" menu items for a card's related list. Shared by
 * the own-card and opponent-card menus so both label and dispatch
 * identically. Ports Cockatrice's
 * addRelatedCardActions (card_menu.cpp:407-479):
 *   - Label format:
 *       count omitted / count="1" → "Token: <pt> <name>"
 *       count="x"                 → "Token: X <pt> <name>"
 *       count=N (numeric > 1)     → "Token: Nx <pt> <name>"
 *   - `pt` is dropped from the label when the token's own Scryfall
 *     record has no power/toughness (spell tokens, transform-back
 *     non-creatures).
 *   - Item still renders when the token's Scryfall lookup is
 *     `unknown` — the parent card's `related` entry is enough to
 *     fire Command_CreateToken with just the name; a stale-image
 *     fallback is better than a missing item.
 *   - `count=N` fires N Command_CreateToken calls in a row
 *     (Cockatrice's actCreateRelatedCard loop). `count="x"` fires
 *     once — Cockatrice prompts the user for a number; that dialog
 *     is a follow-up. `persistent="persistent"` inverts the
 *     default destroy-on-zone-change (rare — most tokens vanish
 *     off the battlefield).
 */
export function buildRelatedTokenItems(
  related: RelatedCardRef[],
  tokenMeta: Map<string, LookupResult>,
  onCreateToken: CreateTokenHandler | undefined,
): CardMenuItem[] {
  const out: CardMenuItem[] = [];
  for (const ref of related) {
    const tok = tokenMeta.get(ref.name);
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
    out.push({
      label: `Token: ${countPrefix}${ptPart}${ref.name}`,
      onClick: () => {
        if (!onCreateToken) {
          return;
        }
        for (let i = 0; i < fireCount; i++) {
          onCreateToken({
            name: tok?.name ?? ref.name,
            color: tokColor,
            pt: tokPT ?? '',
            annotation: '',
            destroyOnZoneChange: ref.persistent !== 'persistent',
            faceDown: false,
            providerId: tokProviderId,
          });
        }
      },
    });
  }
  return out;
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

/**
 * "Token: Transform into '<back-face>'" menu item for DFC-family
 * cards. Ports Cockatrice's addRelatedCardActions transform branch
 * (player_actions.cpp:1198-1206): fires Command_CreateToken with
 * target_card_id + target_mode=TRANSFORM_INTO, which the server
 * processes as "replace the source card with the new token."
 *
 * Returns [] when the card isn't a transformable layout, when the
 * Scryfall face data hasn't landed yet, or when the source card
 * has no numeric id (optimistic mock-id cards can't be targeted).
 * Otherwise returns exactly ONE item — the transform target is the
 * one non-front face.
 */
export function buildTransformItems(
  parentMeta: { layout?: string; faces?: LookupCardFace[] } | undefined,
  sourceCardId: number | undefined,
  parentName: string,
  onCreateToken: CreateTokenHandler | undefined,
): CardMenuItem[] {
  // Servatrice numbers cards from 0 (server_player.cpp newCardId), so 0 is a real id.
  if (!parentMeta || sourceCardId == null || !onCreateToken) {
    return [];
  }
  if (!parentMeta.layout || !TRANSFORMABLE_LAYOUTS.has(parentMeta.layout)) {
    return [];
  }
  const faces = parentMeta.faces ?? [];
  if (faces.length < 2) {
    return [];
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
  return [
    {
      label: `Token: Transform into "${target.name}"`,
      shortcut: 'Ctrl+Shift+T',
      onClick: () => {
        onCreateToken({
          name: target.name,
          color: targetColor,
          pt: targetPT ?? '',
          annotation: '',
          destroyOnZoneChange: false,
          faceDown: false,
          targetCardId: sourceCardId,
          targetMode: 'transform_into',
        });
      },
    },
  ];
}
