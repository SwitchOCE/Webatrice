import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';

import type { DeckFormatFamily } from '@app/types';
import { bracketToneClass, cx, formatDeckAge, toBcp47 } from '@app/utils';
import { ColorPips } from '../ds';

const AGE_KEYS = { unknown: 'Decks.list.age.unknown', justNow: 'Decks.list.age.justNow' } as const;

const FORMAT_BAND: Record<DeckFormatFamily, string> = {
  commander: 'bg-format-commander',
  modern: 'bg-format-modern',
  standard: 'bg-format-standard',
  eternal: 'bg-format-eternal',
  pauper: 'bg-format-pauper',
  other: 'bg-format-other',
};

export function useDeckAge(creationTime?: number): string | null {
  const { t, i18n } = useTranslation();
  if (creationTime == null) {
    return null;
  }
  const age = formatDeckAge(creationTime, toBcp47(i18n.language));
  return t('Decks.list.created', { age: 'key' in age ? t(AGE_KEYS[age.key]) : age.text });
}

export function DeckArt({ url, className }: { url: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) {
    return (
      <span className={cx('flex items-center justify-center bg-bg-elevated', className)} aria-hidden>
        <FileText size={32} strokeWidth={1.25} className="text-text-muted/40" />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(url)}
      className={cx('object-cover object-[center_25%]', className)}
    />
  );
}

export function BracketBadge({ level, solid = false, className }: { level: number; solid?: boolean; className?: string }) {
  const { t } = useTranslation();
  const badge = (
    <span
      className={cx(
        'inline-flex h-[22px] shrink-0 items-center rounded-ui-sm border px-1.5 text-[11px] font-bold tabular-nums leading-none',
        bracketToneClass(level, solid),
        !solid && className,
      )}
      title={t('Decks.badge.bracket', { level })}
    >
      {t('Decks.badge.bracketShort', { level })}
    </span>
  );
  return solid ? <span className={cx('inline-flex shrink-0 rounded-ui-sm bg-over-art-backdrop', className)}>{badge}</span> : badge;
}

export function IdentityPips({ colours, size = 10 }: { colours: string; size?: number }) {
  const { t } = useTranslation();
  const present = ['W', 'U', 'B', 'R', 'G'].filter((c) => colours.includes(c));
  if (present.length === 0) {
    return null;
  }
  return <ColorPips colors={present} size={size} label={t('Decks.badge.identity', { colours: present.join('') })} />;
}

interface DeckCardFaceProps {
  name: string;
  artUrl: string | null;
  colours?: string;
  format: string | null;
  formatFamily: DeckFormatFamily;
  formatKnown: boolean;
  formatDescriptionId: string;
  bracket?: number;
  creationTime?: number;
  cardCount?: number;
  visibilityBadge?: ReactNode;
}

export function DeckCardFace({
  name, artUrl, colours, format, formatFamily, formatKnown, formatDescriptionId, bracket, creationTime, cardCount, visibilityBadge,
}: DeckCardFaceProps) {
  const { t } = useTranslation();
  const created = useDeckAge(creationTime);
  const cards = cardCount != null ? t('DeckTile.cards', { count: cardCount }) : null;
  return (
    <>
      <span className="relative flex h-[124px] items-end overflow-hidden rounded-t-ui-lg px-2 pb-1 pt-2">
        <DeckArt url={artUrl} className="absolute inset-0 h-full w-full" />
        <span
          className="absolute inset-0 bg-gradient-to-b from-transparent from-60% to-over-art-backdrop/90"
          aria-hidden
        />
        <span className="relative flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="max-w-full truncate text-[15px] font-semibold text-over-art-text">
            {name}
          </span>
          {colours !== undefined && <IdentityPips colours={colours} />}
        </span>
      </span>
      <span className={cx('flex h-7 items-center gap-2 px-2', FORMAT_BAND[formatFamily])}>
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-bold text-over-art-text"
          title={formatKnown && !format ? t('Decks.badge.noFormat') : undefined}
        >
          {format ?? (formatKnown ? '—' : '')}
        </span>
        {formatKnown && !format && <span id={formatDescriptionId} className="sr-only">{t('Decks.badge.noFormat')}</span>}
        {visibilityBadge}
        {bracket != null && <BracketBadge level={bracket} solid />}
      </span>
      {(created || cards) && <span className="flex min-w-0 items-center px-2 py-2 text-[12px] text-text-muted">
        <span className="truncate">
          {created}
          {cards && <span className="text-[11px] font-medium text-text-primary">{created ? ' · ' : ''}{cards}</span>}
        </span>
      </span>}
    </>
  );
}
