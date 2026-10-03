export { default as Decks } from './Decks';
export { clearDecksListCache } from './hooks/useDeckList';
export { default as DeckEditor } from './DeckEditor';
export { clearDeckEditorCache } from './deckEditorCache';

// --- Data layer (Piece 1: foundation for MyDecks feature) ---
// The Cockatrice deck document codec and its types are root owners
// (`services/decks`, `types/cockatriceDeck`); only hydrated editor shapes live here.
export type { DeckCard, HydratedDeck } from './types';

export { hydrateDeck, loadDeckFromCod, assembleDeckCard } from './hydrate';
