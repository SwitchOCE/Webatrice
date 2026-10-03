/**
 * Pre-game deck view model — a port of desktop's `DeckViewScene`
 * (`cockatrice/src/game_graphics/deckview/deck_view.cpp`).
 *
 * The deck is the string Servatrice returns for Command_DeckSelect (and
 * resends as `deck_list` between games). Each copy of a card is one entry
 * that remembers the deck zone it came from; a sideboard plan is the list of
 * copies that now sit in a different zone. Zone names are the DECK zones
 * (`main` / `side`), not the in-game `deck` / `sb` zones — Servatrice's
 * `Server_Player::setupZones` only applies plan moves between `main` and
 * `side`.
 */

export const DECK_ZONE_MAIN = 'main';
export const DECK_ZONE_SIDE = 'side';

export type DeckZone = typeof DECK_ZONE_MAIN | typeof DECK_ZONE_SIDE;

/** One plan entry — the shape of `MoveCard_ToZone`. */
export interface SideboardPlanMove {
  cardName: string;
  startZone: string;
  targetZone: string;
}

export interface DeckViewCard {
  /** Stable per-copy key (index in the deck as read). */
  key: number;
  name: string;
  originZone: DeckZone;
}

export interface DeckView {
  main: DeckViewCard[];
  side: DeckViewCard[];
}

export interface ParsedDeckView {
  view: DeckView;
  /** The deck's current sideboard plan (`<sideboard_plan>` named ""). */
  currentPlan: SideboardPlanMove[];
}

/** Desktop's `CURRENT_SIDEBOARD_PLAN_KEY` (`deck_list.cpp`). */
const CURRENT_SIDEBOARD_PLAN_NAME = '';

function directChildren(parent: Element, tagName: string): Element[] {
  return Array.from(parent.children).filter((c) => c.tagName === tagName);
}

function childText(parent: Element, tagName: string): string {
  return directChildren(parent, tagName)[0]?.textContent ?? '';
}

function isDeckZone(zone: string): zone is DeckZone {
  return zone === DECK_ZONE_MAIN || zone === DECK_ZONE_SIDE;
}

/**
 * Reads a Cockatrice deck string into a deck view plus its current
 * sideboard plan. Returns null for an empty or unreadable deck. Only the
 * `main` and `side` zones are kept: they are the only ones the server deals
 * into the game, and the only ones a plan can move between.
 */
export function parseDeckView(xml: string): ParsedDeckView | null {
  if (!xml) {
    return null;
  }
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  const root = dom.documentElement;
  if (dom.getElementsByTagName('parsererror').length > 0 || root?.tagName !== 'cockatrice_deck') {
    return null;
  }

  const view: DeckView = { main: [], side: [] };
  let key = 0;
  for (const zoneEl of directChildren(root, 'zone')) {
    const zone = zoneEl.getAttribute('name') ?? '';
    if (!isDeckZone(zone)) {
      continue;
    }
    for (const cardEl of directChildren(zoneEl, 'card')) {
      const name = (cardEl.getAttribute('name') ?? cardEl.textContent ?? '').trim();
      const count = Number.parseInt(cardEl.getAttribute('number') ?? '1', 10);
      if (!name || !Number.isFinite(count)) {
        continue;
      }
      for (let i = 0; i < count; i++) {
        view[zone].push({ key: key++, name, originZone: zone });
      }
    }
  }

  const currentPlan: SideboardPlanMove[] = [];
  for (const planEl of directChildren(root, 'sideboard_plan')) {
    if (childText(planEl, 'name') !== CURRENT_SIDEBOARD_PLAN_NAME) {
      continue;
    }
    for (const moveEl of directChildren(planEl, 'move_card_to_zone')) {
      currentPlan.push({
        cardName: childText(moveEl, 'card_name'),
        startZone: childText(moveEl, 'start_zone'),
        targetZone: childText(moveEl, 'target_zone'),
      });
    }
  }

  return { view, currentPlan };
}

/**
 * Applies plan moves to a view — `DeckViewScene::applySideboardPlan`: each
 * move takes the first copy with that name from the start zone and appends
 * it to the target zone; moves naming another zone or a missing card are
 * skipped. Returns a new view.
 */
export function applySideboardPlan(view: DeckView, plan: ReadonlyArray<SideboardPlanMove>): DeckView {
  const next: DeckView = { main: [...view.main], side: [...view.side] };
  for (const move of plan) {
    if (!isDeckZone(move.startZone) || !isDeckZone(move.targetZone)) {
      continue;
    }
    const start = next[move.startZone];
    const idx = start.findIndex((card) => card.name === move.cardName);
    if (idx < 0) {
      continue;
    }
    const [card] = start.splice(idx, 1);
    next[move.targetZone].push(card);
  }
  return next;
}

/**
 * The plan a view represents — `DeckViewScene::getSideboardPlan`: one move
 * per copy that sits outside its origin zone, zones in key order (`main`
 * before `side`).
 */
export function getSideboardPlan(view: DeckView): SideboardPlanMove[] {
  const plan: SideboardPlanMove[] = [];
  for (const zone of [DECK_ZONE_MAIN, DECK_ZONE_SIDE] as const) {
    for (const card of view[zone]) {
      if (card.originZone !== zone) {
        plan.push({ cardName: card.name, startZone: card.originZone, targetZone: zone });
      }
    }
  }
  return plan;
}

/** The other deck zone — what a double-click in desktop's deck view moves a card to. */
export function otherDeckZone(zone: DeckZone): DeckZone {
  return zone === DECK_ZONE_MAIN ? DECK_ZONE_SIDE : DECK_ZONE_MAIN;
}

export interface DeckViewGroup {
  name: string;
  count: number;
}

/** Collapses a zone's copies into name/count rows, in first-seen order. */
export function groupDeckZone(cards: ReadonlyArray<DeckViewCard>): DeckViewGroup[] {
  const groups = new Map<string, DeckViewGroup>();
  for (const card of cards) {
    const group = groups.get(card.name);
    if (group) {
      group.count += 1;
    } else {
      groups.set(card.name, { name: card.name, count: 1 });
    }
  }
  return [...groups.values()];
}
