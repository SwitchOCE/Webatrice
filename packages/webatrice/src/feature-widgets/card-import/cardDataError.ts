/**
 * A failed read or write of the card data, for a keyed, translated alert.
 * The raw error text (often a Dexie or quota message) is only a detail.
 */
export interface CardDataError {
  key: 'load' | 'save';
  detail: string;
}

export function toCardDataError(key: CardDataError['key'], error: unknown): CardDataError {
  return { key, detail: error instanceof Error ? error.message : String(error) };
}
