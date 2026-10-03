/**
 * Hands a deck document (`.cod` XML) from one feature to another through a
 * route, without a stored deck: the game stages the deck it is playing and
 * navigates the deck editor to it as an unsaved draft (desktop
 * actOpenDeckInDeckEditor, tab_supervisor.cpp:989-999). The text lives here,
 * in memory, rather than in the URL or the Redux store, because a deck
 * document is large.
 */

const staged = new Map<string, string>();
let nextToken = 0;

/** Stages a deck document; the returned token reads it back once. */
export function stageDeckDocument(cod: string): string {
  nextToken += 1;
  const token = `${Date.now().toString(36)}-${nextToken}`;
  staged.set(token, cod);
  return token;
}

/** The staged deck document for `token`, removed as it is read; undefined
 *  for an unknown or already-read token. */
export function takeStagedDeck(token: string): string | undefined {
  const cod = staged.get(token);
  staged.delete(token);
  return cod;
}
