import { useEffect, useMemo, useState } from 'react';

import type { BracketAssessment } from '@app/types';

import {
  analyzeBracket,
  deckFingerprint,
  fromBracketAssessment,
  isCompleteAnalysis,
  toBracketAssessment,
  type BracketReport,
  type UnavailableSource,
} from '../bracket';
import type { DeckCard } from '../types';

export type BracketAssessmentState =
  /** No usable cached assessment, and the user hasn't allowed the third-party lookups. */
  | { status: 'consentRequired' }
  | { status: 'loading' }
  /** Every source answered (or the deck's cached assessment still matches). */
  | { status: 'complete'; report: BracketReport }
  /** Some source failed: `report.level` is a floor, not the answer. */
  | { status: 'degraded'; report: BracketReport; unavailable: UnavailableSource[] }
  /** `message` is the failure's text; `''` when it had none (the UI shows a generic one). */
  | { status: 'error'; message: string };

/**
 * The commander bracket for `cards`. A cached assessment whose deck
 * fingerprint still matches is used as-is with no network. Otherwise
 * the deck is analysed; only a complete analysis is handed to `persist`
 * (to be written to the `.cod`). A degraded or failed one persists
 * `undefined` instead, so a stale assessment for an older version of the
 * deck is not left behind as if it were current. Re-analyses when the
 * deck's (name, quantity) shape changes, or on `retry`.
 *
 * Analysing calls Scryfall and Commander Spellbook, so it only happens
 * while `lookupsAllowed` is true (see `bracketConsent`); otherwise the
 * state is `consentRequired`. A matching cached assessment needs no
 * network and is shown either way.
 */
export function useBracketAssessment(
  cards: DeckCard[],
  cachedAssessment: BracketAssessment | undefined,
  persist: ((assessment: BracketAssessment | undefined) => void) | undefined,
  lookupsAllowed: boolean,
): BracketAssessmentState & { retry: () => void } {
  // Printing swaps don't change the fingerprint, so they don't trigger a
  // re-analysis; zone moves and commander changes do.
  const fingerprint = useMemo(() => deckFingerprint(cards), [cards]);
  const [state, setState] = useState<BracketAssessmentState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (cachedAssessment && cachedAssessment.fingerprint === fingerprint) {
      // Already on disk for this exact deck shape: nothing to persist.
      setState({ status: 'complete', report: fromBracketAssessment(cachedAssessment) });
      return () => {
        cancelled = true;
      };
    }

    if (!lookupsAllowed) {
      setState({ status: 'consentRequired' });
      // The cached assessment describes an older version of the deck.
      if (cachedAssessment) {
        persist?.(undefined);
      }
      return () => {
        cancelled = true;
      };
    }

    setState({ status: 'loading' });
    analyzeBracket(cards)
      .then((analysis) => {
        if (cancelled) {
          return;
        }
        if (isCompleteAnalysis(analysis)) {
          setState({ status: 'complete', report: analysis.report });
          persist?.(toBracketAssessment(analysis.report, fingerprint));
        } else {
          setState({ status: 'degraded', report: analysis.report, unavailable: analysis.unavailable });
          persist?.(undefined);
        }
      })
      .catch((e) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'error', message: e instanceof Error ? e.message : '' });
        persist?.(undefined);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the deck `fingerprint`, consent and explicit retries
  }, [fingerprint, attempt, lookupsAllowed]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
