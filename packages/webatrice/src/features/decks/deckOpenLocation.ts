export type DeckOpenLocation = 'same-tab' | 'new-tab' | 'cancelled';

/** The save prompt's answers: desktop's Save / Discard / "Open in new tab" / Cancel. */
export type DeckOpenChoice = 'save' | 'discard' | 'new-tab' | 'cancel';

export interface OpenFromEditorState {
  /** Settings › User Interface "Open deck in new tab by default". */
  openDeckInNewTab: boolean;
  isModified: boolean;
  /** An empty deck with no edits: desktop's `isBlankNewDeck`. */
  isBlank: boolean;
}

/**
 * Where a deck loaded from inside an open editor opens, before any prompt: desktop's
 * `AbstractTabDeckEditor::confirmOpen` (abstract_tab_deck_editor.cpp:206). With the option on,
 * a new tab, unless the editor holds a blank new deck; with it off, the same tab unless the deck
 * is modified, which needs the user's choice (`'prompt'`). Opening from Deck Storage is not this
 * path: it always opens a new tab (tab_supervisor.cpp `openDeckInNewTab`).
 */
export function deckOpenLocation({ openDeckInNewTab, isModified, isBlank }: OpenFromEditorState): DeckOpenLocation | 'prompt' {
  if (openDeckInNewTab) {
    return isBlank ? 'same-tab' : 'new-tab';
  }
  return isModified ? 'prompt' : 'same-tab';
}

/** The prompt's answer as a location; Save opens in the same tab only once the save succeeds. */
export async function resolveDeckOpenChoice(choice: DeckOpenChoice, saveNow: () => Promise<boolean>): Promise<DeckOpenLocation> {
  switch (choice) {
    case 'save':
      return (await saveNow()) ? 'same-tab' : 'cancelled';
    case 'discard':
      return 'same-tab';
    case 'new-tab':
      return 'new-tab';
    default:
      return 'cancelled';
  }
}
