/**
 * Local mock types for the ported fancy-webatrice PlayerBox.
 *
 * Fancy's PlayerBox reads from Supabase-backed types (`RoomMemberWithProfile`
 * from `@/lib/rooms`, `DeckCard` from `@/lib/decks`). Og doesn't have
 * those types — its data flows through Cockatrice protobuf via Redux.
 *
 * Rather than rewrite the whole PlayerBox to use Cockatrice types
 * (which is the future wiring work), we define the minimal shape of
 * what fancy actually reads. This lets us keep the port ~1:1 with
 * fancy's source while the wiring lives on placeholder mocks.
 *
 * Every field here is exactly what fancy's PlayerBox
 * accesses on the Supabase rows. Anything unused was dropped.
 */

/** Deck category — no commander zone here (or in the deck feature).
 *  Commander is a per-card `isCommander` flag on the row, not a
 *  distinct zone. See types/cockatriceDeck.ts. */
export type DeckCategory = 'main' | 'sideboard';

/** Card row inside a deck. Mirrors fancy's DeckCard columns for the
 *  fields the PlayerBox reads: id, name, scryfall id, category,
 *  quantity, plus a handful used for filtering + display inside the
 *  library-search modal. */
export interface DeckCard {
  id: string;
  card_scryfall_id: string;
  name: string;
  mana_cost: string | null;
  type_line: string | null;
  cmc: number | null;
  colors: string[];
  set: string | null;
  collector_number: string | null;
  power: string | null;
  toughness: string | null;
  quantity: number;
  category: DeckCategory;
}

/** Room member + attached profile — exactly the fields PlayerBox
 *  reads on the incoming `player` prop. */
export interface RoomMemberWithProfile {
  user_id: string;
  profile: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}
