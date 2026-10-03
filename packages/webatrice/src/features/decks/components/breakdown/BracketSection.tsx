import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import type { BracketAssessment } from '@app/types';

import {
  analyzeBracket,
  deckFingerprint,
  fromBracketAssessment,
  toBracketAssessment,
  type BracketReport,
} from '../../bracket';
import { bracketSignalBadges } from '../../bracketBadges';
import { BRACKET_LABEL } from '../../bracketData';
import { BRACKET_TONE } from '../../bracketTone';
import type { DeckCard } from '../../types';
import { SignalBadge } from './SignalBadge';

export function BracketSection({
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
