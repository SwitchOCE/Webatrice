import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

import {
  analyzeBracket,
  deckFingerprint,
  fromBracketAssessment,
  toBracketAssessment,
  type BracketReport,
} from './bracket';
import { BRACKET_LABEL } from './bracketData';
import { isCommanderFormat, type BracketAssessment } from '@app/types';
import { bracketSignalBadges, type SignalTone } from './bracketBadges';
import { BRACKET_TONE } from './bracketTone';
import { CURVE_BUCKETS, colorPieSlices, computeDeckStats, sortedTypeCounts } from './deckStats';
import { MANA_COLORS, MANA_COLOR_LABEL, manaSymbolUrl, type ManaColor } from './manaSymbols';
import type { CardTypeGroup, DeckCard } from './types';

/**
 * Aggregate deck statistics: totals, mana curve, color distribution,
 * card-type breakdown. Ported from fancy webatrice's `DeckBreakdown`
 * minus the bracket-assessment section — that has a lot of Scryfall-
 * side reference-data plumbing (Game Changers list, MLD, extra turns,
 * Commander Spellbook combos) we haven't ported yet and it's not
 * meaningful for non-commander MTG formats anyway.
 *
 * Rendered under the deck list only when the deck's format is MTG —
 * non-MTG decks have no useful type/curve/color data.
 */

// ---------- Small building blocks ----------

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-bg-elevated border border-border-subtle p-3">
      <div className="text-2xl font-modern font-bold text-text-primary tabular-nums">
        {value}
      </div>
      <div className="text-xs uppercase tracking-widest text-text-muted mt-1">{label}</div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
      {children}
    </h3>
  );
}

function ManaCurve({ curve }: { curve: Record<number, number> }) {
  const max = Math.max(1, ...CURVE_BUCKETS.map((b) => curve[b] ?? 0));
  return (
    <div className="flex items-end gap-1 h-32">
      {CURVE_BUCKETS.map((b) => {
        const count = curve[b] ?? 0;
        const heightPct = (count / max) * 100;
        return (
          <div key={b} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <div className="text-[10px] text-text-muted tabular-nums h-3">
              {count > 0 ? count : ''}
            </div>
            <div
              className="w-full bg-gradient-to-t from-accent-secondary to-accent rounded-t"
              style={{ height: `${heightPct}%` }}
              title={`${count} card${count === 1 ? '' : 's'} at CMC ${b === 7 ? '7+' : b}`}
            />
            <div className="text-xs text-text-muted tabular-nums">{b === 7 ? '7+' : b}</div>
          </div>
        );
      })}
    </div>
  );
}

// Traditional MTG colors, tuned to read on the dark theme.
// (Black gets a lighter tone so it doesn't blend into the background.)
const PIE_HEX: Record<ManaColor, string> = {
  W: '#F8F0C4',
  U: '#4B92DB',
  B: '#4A3B60',
  R: '#E15C4F',
  G: '#4CA96A',
  C: '#B7B7C8',
};

const PIE_SIZE = 240;
const PIE_RADIUS = PIE_SIZE / 2;

function ColorPie({ pips }: { pips: Record<ManaColor, number> }) {
  const total = MANA_COLORS.reduce((s, c) => s + pips[c], 0);

  if (total === 0) {
    return (
      <div
        className="mx-auto rounded-full border border-border-subtle"
        style={{ width: PIE_SIZE, height: PIE_SIZE, background: 'rgb(var(--bg-elevated))' }}
      />
    );
  }

  const slices = colorPieSlices(pips, PIE_RADIUS);
  const legendColors = MANA_COLORS.filter((c) => pips[c] > 0);

  return (
    // 1fr auto 1fr keeps the pie perfectly centered while the legend
    // sits in the right-hand column, aligned to its left edge.
    <div className="grid items-center gap-6" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
      <div aria-hidden />
      <svg
        width={PIE_SIZE}
        height={PIE_SIZE}
        viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`}
        className="shadow-glow rounded-full"
        role="img"
        aria-label="Color distribution pie"
      >
        {slices.map((s) => (
          <path
            key={s.color}
            d={s.path}
            fill={PIE_HEX[s.color]}
            stroke="rgb(var(--bg-base))"
            strokeWidth={slices.length > 1 ? 2 : 0}
          />
        ))}
      </svg>

      <div className="justify-self-start flex flex-col gap-2">
        {legendColors.map((c) => {
          const n = pips[c];
          const pct = (n / total) * 100;
          return (
            <div key={c} className="flex items-center gap-2 text-sm" title={MANA_COLOR_LABEL[c]}>
              <span
                className="h-3 w-3 rounded-sm border border-border-subtle shrink-0"
                style={{ backgroundColor: PIE_HEX[c] }}
              />
              <img
                src={manaSymbolUrl(c)}
                alt={MANA_COLOR_LABEL[c]}
                className="w-5 h-5 shrink-0"
                draggable={false}
              />
              <span className="text-text-primary tabular-nums font-semibold">{n}</span>
              <span className="text-text-muted tabular-nums text-xs">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TypeBreakdown({
  counts,
}: {
  counts: Partial<Record<CardTypeGroup, number>>;
}) {
  const entries = sortedTypeCounts(counts);

  if (entries.length === 0) {
    return <div className="text-sm text-text-muted italic">No cards yet.</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.map(([type, count]) => (
        <div
          key={type}
          className="flex items-center justify-between px-3 py-1.5 rounded-md bg-bg-elevated border border-border-subtle text-sm"
        >
          <span className="text-text-primary">{type}</span>
          <span className="text-text-muted tabular-nums">{count}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Bracket assessment ----------

/**
 * Signal badge with a portal-rendered hover tooltip listing the cards
 * that contributed to the count. Ports fancy webatrice's `CountBadge`.
 *
 * Design notes:
 *   • Tooltip is portal-mounted so it can escape any `overflow: hidden`
 *     ancestors (the deck-breakdown lives inside the editor's scroll
 *     container).
 *   • 120ms grace period on mouse-leave so the user can move the
 *     cursor into the tooltip to scroll long lists.
 *   • Flip above / below based on available viewport space so it
 *     doesn't get cropped at the page edge.
 */
function SignalBadge({
  label,
  count,
  tone,
  items,
}: {
  label: string;
  count: number;
  tone: SignalTone;
  items: string[];
}) {
  const toneClass =
    tone === 'hot'
      ? 'text-red-300 bg-red-500/10 border-red-500/30'
      : tone === 'warn'
        ? 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30'
        : 'text-text-secondary bg-bg-elevated border-border-subtle';

  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canHover = items.length > 0;

  const show = () => {
    if (!canHover || !ref.current) {
      return;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setRect(ref.current.getBoundingClientRect());
  };
  const scheduleHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(() => setRect(null), 120);
  };

  useEffect(() => {
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, []);

  // Pick the side with more vertical room — 220px is roughly enough
  // for ~10 items before the user needs to scroll inside the tooltip.
  const TOOLTIP_WIDTH = 260;
  const layout = rect
    ? (() => {
      const EDGE = 8;
      const GAP = 6;
      const spaceBelow = window.innerHeight - rect.bottom - EDGE;
      const spaceAbove = rect.top - EDGE;
      const showBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
      const maxHeight = Math.min(
        560,
        showBelow ? spaceBelow - GAP : spaceAbove - GAP,
      );
      return {
        left: Math.max(
          EDGE,
          Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - EDGE),
        ),
        top: showBelow ? rect.bottom + GAP : undefined,
        bottom: showBelow ? undefined : window.innerHeight - rect.top + GAP,
        maxHeight,
      };
    })()
    : null;

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        className={`px-2.5 py-1.5 rounded-md border text-xs ${toneClass} ${canHover ? 'cursor-help' : ''}`}
      >
        <div className="uppercase tracking-wider text-[10px] opacity-70">{label}</div>
        <div className="font-semibold tabular-nums text-sm">{count}</div>
      </div>
      {rect && layout &&
        createPortal(
          <div
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
            className="fixed z-[60] rounded-lg bg-bg-surface border border-border-subtle shadow-glow py-2 px-3 flex flex-col"
            style={{
              left: layout.left,
              top: layout.top,
              bottom: layout.bottom,
              width: TOOLTIP_WIDTH,
              maxHeight: layout.maxHeight,
            }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-1.5 shrink-0">
              {label}
            </div>
            <ul className="space-y-0.5 text-xs text-text-primary overflow-y-auto pr-1">
              {items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}

function BracketSection({
  cards,
  cachedAssessment,
  onAssessmentComputed,
}: {
  cards: DeckCard[];
  /** Previously-persisted assessment from the .cod's `<bracketAssessment>`
   *  element. When its fingerprint matches the current deck we skip
   *  the network round-trips entirely and just render the cached
   *  signals. Mismatch → re-run analyzeBracket. */
  cachedAssessment?: BracketAssessment;
  /** Called after `analyzeBracket` resolves (or when we hydrate from
   *  the cache) so the caller can persist the result to the .cod.
   *  Receives the full assessment (level + flagged card lists +
   *  fingerprint). Passes `undefined` when the deck is empty or the
   *  assessment failed. */
  onAssessmentComputed?: (assessment: BracketAssessment | undefined) => void;
}) {
  const fingerprint = useMemo(() => deckFingerprint(cards), [cards]);
  const [report, setReport] = useState<BracketReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Cache hit: the persisted assessment was computed against the
    // exact same (name, quantity) shape we're rendering now, so we
    // can render it directly and skip the Scryfall + Spellbook
    // fetches. Skip the onAssessmentComputed callback too — nothing
    // to persist since the value already matches the .cod on disk.
    if (cachedAssessment && cachedAssessment.fingerprint === fingerprint) {
      setReport(fromBracketAssessment(cachedAssessment));
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    analyzeBracket(cards)
      .then((r) => {
        if (cancelled) {
          return;
        }
        setReport(r);
        setLoading(false);
        onAssessmentComputed?.(toBracketAssessment(r, fingerprint));
      })
      .catch((e) => {
        if (cancelled) {
          return;
        }
        setError(e instanceof Error ? e.message : 'Bracket assessment failed');
        setLoading(false);
        onAssessmentComputed?.(undefined);
      });
    return () => {
      cancelled = true;
    };
    // Fingerprint captures the meaningful shape of `cards` — printing
    // swaps and category toggles don't invalidate the assessment.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `fingerprint` (see above)
  }, [fingerprint]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin" /> Assessing bracket…
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-text-muted">Couldn't assess bracket: {error}</div>;
  }

  if (!report) {
    return null;
  }
  const tone = BRACKET_TONE[report.level];
  const badges = bracketSignalBadges(report.signals);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div
          className={`h-16 w-16 rounded-lg border ${tone.bg} ${tone.border} flex items-center justify-center`}
        >
          <span className={`text-3xl font-modern font-bold tabular-nums ${tone.text}`}>
            {report.level}
          </span>
        </div>
        <div>
          <div className={`text-sm font-semibold ${tone.text}`}>
            Bracket {report.level} · {BRACKET_LABEL[report.level]}
          </div>
          <div className="text-xs text-text-muted mt-1">
            Minimum bracket per{' '}
            <a
              href="https://edhpowerlevel.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-text-primary"
            >
              edhpowerlevel
            </a>
            's algorithm: Game Changers, MLD, extra turns, and early game-defining combos.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {badges.map((badge) => (
          <SignalBadge
            key={badge.label}
            label={badge.label}
            count={badge.count}
            tone={badge.tone}
            items={badge.items}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Main component ----------

export default function DeckBreakdown({
  cards,
  format,
  cachedAssessment,
  onAssessmentComputed,
}: {
  cards: DeckCard[];
  /** Deck format. Bracket section only renders for Commander proper
   *  (not Pauper Commander, Oathbreaker, etc. — brackets are a
   *  Commander-format concept). */
  format: string;
  /** Previously-persisted bracket assessment from the .cod. When its
   *  fingerprint matches the current deck we skip the Scryfall +
   *  Spellbook fetches and render the cached signals directly. */
  cachedAssessment?: BracketAssessment;
  /** Optional callback fired after bracket assessment resolves.
   *  DeckEditor forwards this to `setBracketAssessment` so the full
   *  assessment (level + flagged cards + fingerprint) lands in the
   *  `<bracketAssessment>` XML element, and its level mirrors into
   *  `meta.bracketLevel` for legacy consumers. */
  onAssessmentComputed?: (assessment: BracketAssessment | undefined) => void;
}) {
  const stats = useMemo(() => computeDeckStats(cards), [cards]);
  // Brackets are a Commander concept. Include Pauper Commander since
  // it shares commander-designation UX; if it turns out brackets read
  // weirdly for pauper we can tighten to `format === 'commander'` only.
  const showBracket = isCommanderFormat(format) && stats.totalCards > 0;

  if (stats.totalCards === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionHeader>Overview</SectionHeader>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total" value={stats.totalCards} />
          <StatCard label="Nonland" value={stats.nonlandCards} />
          <StatCard label="Lands" value={stats.landCount} />
          <StatCard label="Avg CMC" value={stats.avgNonlandCmc.toFixed(2)} />
        </div>
      </section>

      {showBracket && (
        <section>
          <SectionHeader>Bracket estimate</SectionHeader>
          <BracketSection
            cards={cards}
            cachedAssessment={cachedAssessment}
            onAssessmentComputed={onAssessmentComputed}
          />
        </section>
      )}

      <section>
        <SectionHeader>Mana curve</SectionHeader>
        <ManaCurve curve={stats.curve} />
      </section>

      <section>
        <SectionHeader>Color distribution</SectionHeader>
        <ColorPie pips={stats.pips} />
      </section>

      <section>
        <SectionHeader>Card types</SectionHeader>
        <TypeBreakdown counts={stats.typeCounts} />
      </section>
    </div>
  );
}
