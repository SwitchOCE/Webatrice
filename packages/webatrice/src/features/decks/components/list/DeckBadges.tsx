import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

import { cx, toBcp47 } from '@app/utils';

import type { DeckVisibility } from '../../deckTree';

export function DeckPriceBadge({
  price,
  className,
}: {
  price: { usd?: number; missing?: number } | undefined;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  if (price === undefined) {
    return (
      <span className={cx('tabular-nums text-text-muted', className)} title={t('Decks.badge.priceLoading')}>
        · · ·
      </span>
    );
  }
  if (price.usd == null) {
    return (
      <span className={cx('tabular-nums text-text-muted', className)} title={t('Decks.badge.priceNone')}>
        —
      </span>
    );
  }
  const missing = price.missing && price.missing > 0 ? price.missing : 0;
  const amount = new Intl.NumberFormat(toBcp47(i18n.language) || undefined, { style: 'currency', currency: 'USD' })
    .format(price.usd);
  return (
    <span
      className={cx('font-medium tabular-nums text-success', className)}
      title={missing ? t('Decks.badge.priceTotalMissing', { count: missing }) : t('Decks.badge.priceTotal')}
    >
      {amount}
      {missing ? '+' : ''}
    </span>
  );
}

export function TagChip({ children, className }: { children: string; className?: string }) {
  return (
    <span
      title={children}
      className={cx(
        'block h-5 max-w-[10rem] truncate rounded-full border border-border-subtle bg-bg-elevated',
        'px-2 text-[11px] leading-[18px] text-text-secondary',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DeckVisibilityBadge({ visibility, kind, className }: {
  visibility: DeckVisibility;
  kind: 'deck' | 'folder';
  className?: string;
}) {
  const { t } = useTranslation();
  if (visibility === 'private') {
    return null;
  }
  const tooltip = visibility === 'public'
    ? t(kind === 'deck' ? 'DeckSharing.deckPublic' : 'DeckSharing.folderPublic')
    : t(kind === 'deck' ? 'DeckSharing.deckInherited' : 'DeckSharing.folderInherited');
  return (
    <span
      title={tooltip}
      className={cx(
        'inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full bg-bg-base/85 px-2 text-[11px] font-medium leading-none text-accent',
        className,
      )}
    >
      <Globe size={11} aria-hidden /> {t(visibility === 'public' ? 'DeckSharing.public' : 'DeckSharing.inherited')}
    </span>
  );
}
