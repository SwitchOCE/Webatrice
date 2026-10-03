import { useTranslation } from 'react-i18next';
import { CircleAlert, Globe, Loader2, RefreshCw } from 'lucide-react';

import type { BracketAssessment } from '@app/types';

import type { UnavailableSource } from '../../bracket';
import { bracketSignalBadges } from '../../bracketBadges';
import { useBracketLookupsConsent } from '../../bracketConsent';
import { BRACKET_LABEL } from '../../bracketData';
import type { SourceFailure } from '../../bracketSources';
import { BRACKET_TONE } from '../../bracketTone';
import { useBracketAssessment } from '../../hooks/useBracketAssessment';
import type { DeckCard } from '../../types';
import { SignalBadge } from './SignalBadge';

export interface BracketSectionProps {
  cards: DeckCard[];
  /** The `.cod`'s cached `<bracketAssessment>`; used without any network
   *  while its fingerprint matches the deck. */
  cachedAssessment?: BracketAssessment;
  /** Receives a complete assessment to persist on the `.cod`, or
   *  `undefined` when the analysis was incomplete or failed. */
  onAssessmentComputed?: (assessment: BracketAssessment | undefined) => void;
}

export function BracketSection({ cards, cachedAssessment, onAssessmentComputed }: BracketSectionProps) {
  const { t } = useTranslation();
  const [lookupsAllowed, setLookupsAllowed] = useBracketLookupsConsent();
  const assessment = useBracketAssessment(cards, cachedAssessment, onAssessmentComputed, lookupsAllowed);

  if (assessment.status === 'consentRequired') {
    return <BracketConsentPrompt onAllow={() => setLookupsAllowed(true)} />;
  }

  if (assessment.status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin" /> Assessing bracket…
      </div>
    );
  }

  if (assessment.status === 'error') {
    return <div className="text-sm text-text-muted">Couldn't assess bracket: {assessment.message}</div>;
  }

  const { report } = assessment;
  const degraded = assessment.status === 'degraded';
  const tone = BRACKET_TONE[report.level];
  const badges = bracketSignalBadges(report.signals);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div
          className={`h-16 w-16 rounded-lg border ${tone.bg} ${tone.border} flex items-center justify-center`}
        >
          <span className={`text-3xl font-modern font-bold tabular-nums ${tone.text}`}>
            {report.level}{degraded && '+'}
          </span>
        </div>
        <div>
          <div className={`text-sm font-semibold ${tone.text}`}>
            {degraded
              ? t('DeckBracket.partialTitle', { level: report.level, label: BRACKET_LABEL[report.level] })
              : `Bracket ${report.level} · ${BRACKET_LABEL[report.level]}`}
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
          <div className="text-xs text-text-muted mt-1">
            {t('DeckBracket.provenance')}
            {lookupsAllowed && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => setLookupsAllowed(false)}
                  className="underline hover:text-text-primary"
                >
                  {t('DeckBracket.consent.revoke')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {assessment.status === 'degraded' && (
        <BracketDegradedNotice unavailable={assessment.unavailable} onRetry={assessment.retry} />
      )}

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

/**
 * First use: nothing goes to Scryfall or Commander Spellbook until the
 * user allows it. The choice is remembered for every deck.
 */
function BracketConsentPrompt({ onAllow }: { onAllow: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="text-sm text-text-muted">{t('DeckBracket.consent.prompt')}</p>
      <button
        type="button"
        onClick={onAllow}
        className={[
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-border-strong bg-bg-elevated',
          'text-sm text-text-primary hover:bg-border-subtle',
        ].join(' ')}
      >
        <Globe size={13} /> {t('DeckBracket.consent.allow')}
      </button>
    </div>
  );
}

const FAILURE_KEY: Record<SourceFailure['kind'], string> = {
  timeout: 'DeckBracket.failure.timeout',
  network: 'DeckBracket.failure.network',
  http: 'DeckBracket.failure.http',
  malformed: 'DeckBracket.failure.malformed',
};

/**
 * Shown when a data source was unreachable: the level is only a floor
 * (missing data can hide signals, never add them) and isn't saved with
 * the deck.
 */
function BracketDegradedNotice({ unavailable, onRetry }: {
  unavailable: UnavailableSource[];
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex items-start gap-2 text-xs text-yellow-200 bg-yellow-500/10 border border-yellow-500/30 rounded-md px-3 py-2"
    >
      <CircleAlert size={14} className="shrink-0 mt-0.5 text-yellow-300" />
      <div className="flex-1 min-w-0">
        <div>{t('DeckBracket.partialNotice')}</div>
        <ul className="mt-1 text-text-muted">
          {unavailable.map(({ source, failure, missing, total }) => {
            const params = {
              source: t(`DeckBracket.source.${source}`),
              reason: t(FAILURE_KEY[failure.kind], failure.kind === 'http' ? { status: failure.status } : {}),
            };
            return (
              <li key={source}>
                {missing != null
                  ? t('DeckBracket.sourcePartial', { ...params, missing, total })
                  : t('DeckBracket.sourceUnavailable', params)}
              </li>
            );
          })}
        </ul>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={[
          'shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-yellow-500/40',
          'text-yellow-200 hover:bg-yellow-500/15 transition-colors',
        ].join(' ')}
      >
        <RefreshCw size={11} /> {t('DeckBracket.retry')}
      </button>
    </div>
  );
}
