import { Heart } from 'lucide-react';

import { ManaSymbols } from '../../ui/ManaSymbols/ManaSymbols';
import { usePlayerSeatContext } from '../../ui/PlayerBoard/PlayerSeatContext';
import ZoneStack from '../../ui/ZoneStack/ZoneStack';
import { MANA_COLORS } from './manaColors';

/** One mana-pool counter: the symbol with its count. The owner clicks to add
 *  one and right-clicks to remove one (desktop's counter +1 / -1). */
function ManaPip({
  symbol,
  label,
  count,
  tint,
  onIncrement,
  onDecrement,
}: {
  symbol: string;
  label: string;
  count: number;
  tint: string;
  /** Left-click handler. When present the pip becomes clickable and
   *  fires the Cockatrice canonical ±1 counter change on the server. */
  onIncrement?: () => void;
  /** Right-click handler; suppresses the browser context menu. */
  onDecrement?: () => void;
}) {
  const clickable = !!onIncrement || !!onDecrement;
  // Standard MTG mana symbols Scryfall has SVGs for at
  // https://svgs.scryfall.io/card-symbols/<X>.svg. The "Other" pool
  // slot (O → Cockatrice's `storm` counter) isn't a real mana symbol
  // and 404s from Scryfall; render a solid tinted circle for those
  // instead so we don't ship a broken-image icon.
  const hasScryfallSvg = /^[WUBRGCX]$/.test(symbol);
  // Pip size dropped from fancy's 2.75em to 2em so the 3-wide grid
  // fits inside the compact info column without widening it.
  return (
    <div
      className="relative"
      style={{
        width: '2em',
        height: '2em',
        cursor: clickable ? 'pointer' : undefined,
      }}
      title={label}
      role={clickable ? 'button' : undefined}
      onClick={onIncrement}
      onContextMenu={
        onDecrement
          ? (e) => {
            e.preventDefault();
            onDecrement();
          }
          : undefined
      }
    >
      {hasScryfallSvg ? (
        <ManaSymbols cost={`{${symbol}}`} size="2em" />
      ) : (
        // Solid tinted disc for symbols without a Scryfall SVG (e.g.
        // "O" = Cockatrice's Other/storm). Full-opacity fill with a
        // subtle dark ring reads as "physical pip" without needing
        // the ManaSymbols SVG underneath.
        <div
          className="absolute inset-0 rounded-full pointer-events-none border border-black/50"
          style={{ backgroundColor: tint }}
        />
      )}
      {/* 50% color wash sitting on top of the pip. Skipped for pips
          that already have a full-opacity disc (see above) so their
          color isn't washed out to 50%. */}
      {hasScryfallSvg && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ backgroundColor: tint, opacity: 0.5 }}
        />
      )}
      <span
        className="absolute inset-0 flex items-center justify-center text-white font-bold text-[0.75em] tabular-nums pointer-events-none"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,1)' }}
      >
        {count}
      </span>
    </div>
  );
}

/**
 * Info column — spans both rows. Top: full-width header + life total.
 * Bottom: mana-pool sub-column on the left + card zones on the right.
 */
export default function PlayerInfoPanel() {
  const {
    counterCommands,
    isSelf,
    life,
    manaCounters,
    manaPool,
    name,
    playerId,
    seat,
    setLife,
  } = usePlayerSeatContext();

  return (
    <div
      className="row-span-full border-r border-border-subtle bg-bg-surface/70 flex flex-col p-[0.75em] gap-[0.5em] min-h-0"
      style={{ gridColumn: 1 }}
    >
      {/* Combined name + life-total pill. Avatar (or purple gradient
         fallback) fills the whole block; a 50% black wash keeps
         the name / number readable. The player name sits pinned
         to the top-left, the life total is centered — merging the
         two into a single visual block instead of a name row plus
         a separate life pill.
         Owner interactions on the whole block:
           • left click  → +1 life (delta)
           • right click → -1 life (delta) — browser context menu
             is suppressed via preventDefault
           • Ctrl / Cmd + L → opens the set-life modal (registered
             in a useEffect below on window keydown; only fires for
             the local player's box)
         Non-owner boxes render read-only (no cursor change, no
         click handlers). */}
      <div
        role={isSelf ? 'button' : undefined}
        tabIndex={isSelf ? 0 : undefined}
        aria-label={isSelf ? `${name} — life total. Left click +1, right click -1, Ctrl/Cmd+L to set` : `${name} — life total`}
        // Arrow target for right-click-drag arrows aimed at a player's
        // life total. The interactions hook hit-tests by looking for
        // `[data-arrow-target-kind="player"]` under the pointer; the
        // overlay resolves player-targeted committed arrows the same
        // way. Both self and opponent pills carry these — you can
        // point arrows at yourself in Cockatrice too.
        data-arrow-target-kind="player"
        data-arrow-target-player-id={playerId}
        onClick={isSelf ? () => setLife((l) => l + 1) : undefined}
        onContextMenu={
          isSelf
            ? (e) => {
              e.preventDefault();
              setLife((l) => l - 1);
            }
            : undefined
        }
        className={[
          'relative flex flex-col rounded-md overflow-hidden',
          isSelf ? 'cursor-pointer select-none' : '',
        ].join(' ')}
        style={{
          backgroundImage: seat.avatarUrl
            ? `url(${seat.avatarUrl})`
            : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {!seat.avatarUrl && (
          <>
            <div
              className="absolute inset-0 bg-gradient-to-br from-accent-secondary to-accent pointer-events-none"
              aria-hidden
            />
            {/* Wash only over the purple fallback — keeps no-avatar
              pills at a consistent darker tone. Avatars stay
              unfiltered so the user's picture reads clearly. */}
            <div
              className="absolute inset-0 bg-black/50 pointer-events-none"
              aria-hidden
            />
          </>
        )}
        {/* Name row — pinned to the top. Stacked text-shadows (soft
          halo + tight outline) give the name a dark drop shadow
          that stays readable against any avatar color without
          needing a wash over the image. */}
        <div className="relative z-10 px-[0.5em] pt-[0.35em] pointer-events-none">
          <span
            className="block text-[0.875em] font-semibold text-white truncate"
            style={{ textShadow: '0 2px 6px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,1), 0 0 1px rgba(0,0,0,1)' }}
          >
            {name}
          </span>
        </div>
        {/* Life row — centered in the remaining space. The Heart is
          an SVG so we use `filter: drop-shadow(...)` for its
          shadow (text-shadow only affects glyphs). */}
        <div className="relative z-10 flex-1 flex items-center justify-start gap-[0.75em] px-[0.5em] pb-[0.25em] pointer-events-none">
          <Heart
            size="2.5em"
            className="text-red-400"
            style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.95)) drop-shadow(0 0 2px rgba(0,0,0,1))' }}
          />
          <span
            className="text-[3em] font-modern font-bold tabular-nums text-white leading-none"
            style={{ textShadow: '0 3px 10px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,1), 0 0 2px rgba(0,0,0,1)' }}
          >
            {life}
          </span>
        </div>
      </div>

      {/* Below the life total: mana pool sits as the first item of
         the zone column — same `justify-evenly` distribution as
         library / graveyard / exile so it reads as one of the
         stacked column items rather than a separate block. */}
      <div className="flex-1 min-w-0 flex flex-col justify-evenly min-h-0">
        {/* Mana pool — 3 × 2 grid of pips (WUB / RGC). Grid keeps
          the block compact so the info column stays narrow. */}
        <div className="shrink-0 grid grid-cols-3 gap-1 justify-items-center">
          {MANA_COLORS.map((m, i) => {
            const counter = manaCounters?.[m.symbol];
            const canModify =
            isSelf && counter != null;
            const pip = (
              <ManaPip
                symbol={m.symbol}
                label={m.label}
                tint={m.tint}
                count={manaPool[m.symbol]}
                onIncrement={
                  canModify
                    ? () => counterCommands.increment(counter.id, 1)
                    : undefined
                }
                onDecrement={
                  canModify
                    ? () => counterCommands.increment(counter.id, -1)
                    : undefined
                }
              />
            );
            // 7 pips in a 3-col grid → the last one wraps to a new
            // row alone in column 1. Span the full row and center
            // it via flex so the odd-one-out sits under the middle
            // column instead of hugging the left edge.
            const isLastInPartialRow =
            MANA_COLORS.length % 3 !== 0 &&
            i === MANA_COLORS.length - 1;
            if (isLastInPartialRow) {
              return (
                <div
                  key={m.symbol}
                  className="col-span-3"
                >
                  {pip}
                </div>
              );
            }
            return <div key={m.symbol}>{pip}</div>;
          })}
        </div>
        <ZoneStack />
      </div>
    </div>
  );
}
