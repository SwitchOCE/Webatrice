import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { useAnimationPreference } from '@app/hooks';

import { ManaSymbols } from '@app/components';
import { usePlayerSeatContext } from '../../ui/PlayerBoard/PlayerSeatContext';
import { useValueFlash } from '../../ui/ValueFlash/useValueFlash';
import ValueFlashOverlay from '../../ui/ValueFlash/ValueFlashOverlay';
import ZoneBackground from '../../ui/ZoneBackground/ZoneBackground';
import ZoneStack from '../../ui/ZoneStack/ZoneStack';
import { MANA_COLORS } from './manaColors';
import { OVER_ART_ICON_SHADOW, OVER_ART_SHADOW_LIFE, OVER_ART_SHADOW_NAME, OVER_ART_SHADOW_PIP } from '../../ui/seatColors/seatColors';

/** The step an arrow key asks a counter for: ↑ adds one and ↓ removes one, as a spin box does. */
function counterStep(event: KeyboardEvent): 1 | -1 | 0 {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return 0;
  }
  return event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
}

/** One mana-pool counter: the symbol with its count. The owner clicks to add
 *  one and right-clicks to remove one (desktop's counter +1 / -1); from the
 *  keyboard it is a spin button, ↑ and ↓. */
function ManaPip({
  symbol,
  label,
  count,
  tint,
  onIncrement,
  onDecrement,
  tabIndex,
  onFocus,
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
  /** The pool is one tab stop: the pip that has it is 0, the others -1. */
  tabIndex?: number;
  onFocus?: () => void;
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
      role={clickable ? 'spinbutton' : undefined}
      tabIndex={clickable ? tabIndex : undefined}
      aria-label={clickable ? label : undefined}
      aria-valuenow={clickable ? count : undefined}
      aria-valuemin={clickable ? 0 : undefined}
      onFocus={onFocus}
      onKeyDown={clickable ? (e) => {
        const step = counterStep(e);
        if (step !== 0) {
          e.preventDefault();
          (step > 0 ? onIncrement : onDecrement)?.();
        }
      } : undefined}
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
          className="absolute inset-0 rounded-full pointer-events-none border border-over-art-backdrop/50"
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
      {/* An opponent's pip is text: its colour, read before the count. */}
      {!clickable && <span className="sr-only">{label}</span>}
      <span
        className={
          'absolute inset-0 flex items-center justify-center text-over-art-text font-bold text-[0.75em] '
          + 'tabular-nums pointer-events-none'
        }
        style={{ textShadow: OVER_ART_SHADOW_PIP }}
        aria-hidden={clickable || undefined}
      >
        {count}
      </span>
    </div>
  );
}

/**
 * Info column — spans the seat's rows (see seatGrid). Top: full-width header + life total.
 * Bottom: mana-pool sub-column on the left + card zones on the right.
 */
export default function PlayerInfoPanel() {
  const {
    counterCommands,
    isSelf,
    life,
    lifeControl,
    manaCounters,
    name,
    openLifePrompt,
    playerId,
    seat,
    seatGrid,
    setLife,
  } = usePlayerSeatContext();
  const { t } = useTranslation();
  // The mana pool is one tab stop; ← and → move between its pips (a roving tab index).
  const [manaFocus, setManaFocus] = useState(0);
  // Desktop's "Life counter flash": green on a gain, red on a loss, from the
  // server's life counter (the fallback before it exists never flashes).
  const lifeFlash = useValueFlash(lifeControl?.value, useAnimationPreference('lifeCounterAnimations'));
  // Mana pool: read from the wired `manaCounters` when available
  // (Redux-authoritative), fall back to zeros during pre-hydration.
  // Local mana pool is per-player and matches Cockatrice's
  // Servatrice-created counters (w/u/b/r/g/x/storm) — see
  // server_player.cpp:96-102.
  const manaPool: Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'O', number> = {
    W: manaCounters?.W?.count ?? 0,
    U: manaCounters?.U?.count ?? 0,
    B: manaCounters?.B?.count ?? 0,
    R: manaCounters?.R?.count ?? 0,
    G: manaCounters?.G?.count ?? 0,
    C: manaCounters?.C?.count ?? 0,
    O: manaCounters?.O?.count ?? 0,
  };

  return (
    <div
      className="relative isolate border-r border-border-subtle bg-bg-surface/70 flex flex-col p-[0.75em] gap-[0.5em] min-h-0"
      style={seatGrid.info}
    >
      <ZoneBackground zone="playerInfo" />
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
           • Ctrl / Cmd + L → opens the set-life modal (the
             game.setLife shortcut; only fires for the local
             player's box)
         From the keyboard the owner's block is a spin button: ↑ / ↓
         change life by one and Enter opens the set-life prompt
         (desktop's "Set counter..."). It is named "Alice's life" and
         carries the total as its value. Changes, the owner's and
         everyone else's, are announced once, by the game log's live
         region; the block itself is not a live region.
         Non-owner boxes render read-only (no cursor change, no
         click handlers): a group, named the same, around the name
         and the number. */}
      <div
        role={isSelf ? 'spinbutton' : 'group'}
        tabIndex={isSelf ? 0 : undefined}
        aria-label={t('PlayerInfoPanel.life', { name })}
        aria-valuenow={isSelf ? life : undefined}
        title={isSelf ? t('PlayerInfoPanel.lifeHint') : undefined}
        onKeyDown={isSelf ? (e) => {
          const step = counterStep(e);
          if (step !== 0) {
            e.preventDefault();
            setLife((l) => l + step);
          } else if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            openLifePrompt();
          }
        } : undefined}
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
              className="absolute inset-0 bg-over-art-backdrop/50 pointer-events-none"
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
            className="block text-[0.875em] font-semibold text-over-art-text truncate"
            style={{ textShadow: OVER_ART_SHADOW_NAME }}
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
            className="text-over-art-life"
            style={{ filter: OVER_ART_ICON_SHADOW }}
            aria-hidden
          />
          <span
            className="text-[3em] font-modern font-bold tabular-nums text-over-art-text leading-none"
            style={{ textShadow: OVER_ART_SHADOW_LIFE }}
          >
            {life}
          </span>
        </div>
        <ValueFlashOverlay flash={lifeFlash} kind="change" />
      </div>

      {/* Below the life total: mana pool sits as the first item of
         the zone column — same `justify-evenly` distribution as
         library / graveyard / exile so it reads as one of the
         stacked column items rather than a separate block. */}
      <div className="flex-1 min-w-0 flex flex-col justify-evenly min-h-0">
        {/* Mana pool — 3 × 2 grid of pips (WUB / RGC). Grid keeps
          the block compact so the info column stays narrow. */}
        <div
          role="group"
          aria-label={t('PlayerInfoPanel.manaPool')}
          className="shrink-0 grid grid-cols-3 gap-1 justify-items-center"
          onKeyDown={(e) => {
            if (!isSelf || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) {
              return;
            }
            e.preventDefault();
            const next = (manaFocus + (e.key === 'ArrowRight' ? 1 : -1) + MANA_COLORS.length) % MANA_COLORS.length;
            setManaFocus(next);
            e.currentTarget.querySelectorAll<HTMLElement>('[role="spinbutton"]')[next]?.focus();
          }}
        >
          {MANA_COLORS.map((m, i) => {
            const counter = manaCounters?.[m.symbol];
            const canModify =
            isSelf && counter != null;
            const pip = (
              <ManaPip
                symbol={m.symbol}
                label={t(`PlayerInfoPanel.mana.${m.symbol}`)}
                tabIndex={i === manaFocus ? 0 : -1}
                onFocus={() => setManaFocus(i)}
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
