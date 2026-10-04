/** Router state that asks My Decks to open one of its dialogs on arrival (`deck.new` / `deck.load` from the editor). */
export interface DecksLocationState {
  open: 'create' | 'import';
}
