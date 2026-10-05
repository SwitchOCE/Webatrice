import { getScryfallSymbolUrl } from '@app/services';

import { isManaToken, manaCostTokens } from './manaTokens';

/**
 * Renderers for Scryfall mana-cost / oracle-text tokens like `{3}`, `{R}`,
 * `{2/W}`, `{W/U}`, `{T}`, `{X}`, shared by the deck editor and the game:
 *   - <ManaSymbols cost="{3}{R}{G}" />  — pure symbol row, wrapped in flex
 *   - <SymbolText text="{T}: Add {G}" /> — text with symbols interpolated
 */

/** One `{X}` symbol as its Scryfall SVG. */
export function ManaSymbol({ token, size }: { token: string; size: number | string }) {
  // Size via CSS style, not HTML width/height attrs, so em/rem/% work.
  return (
    <img
      src={getScryfallSymbolUrl(token)}
      alt={token}
      style={{ width: size, height: size }}
      className="inline-block align-text-bottom"
      draggable={false}
    />
  );
}

/** A mana cost such as `{2}{U}{R}` as an inline row of symbols; nothing for an empty cost. */
export function ManaSymbols({
  cost,
  size = 14,
  className,
}: {
  cost: string;
  size?: number | string;
  className?: string;
}) {
  const tokens = manaCostTokens(cost);
  if (tokens.length === 0) {
    return null;
  }
  return (
    <span className={`inline-flex items-center gap-0.5 align-middle ${className ?? ''}`}>
      {tokens.map((tok, i) => (
        <ManaSymbol key={i} token={tok} size={size} />
      ))}
    </span>
  );
}

/**
 * Rules text with its `{X}` symbols drawn inline. Split-based, so
 * newlines survive through the parent's `whitespace-pre-line`.
 */
export function SymbolText({ text, size = 12 }: { text: string; size?: number }) {
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <>
      {parts.map((p, i) => {
        if (isManaToken(p)) {
          return <ManaSymbol key={i} token={p} size={size} />;
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}
