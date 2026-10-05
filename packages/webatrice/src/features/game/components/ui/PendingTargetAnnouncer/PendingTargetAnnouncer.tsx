import { useTranslation } from 'react-i18next';

import { usePendingTargetContext } from '../PendingTargetContext';

/**
 * Says what a pending target pick wants, politely, for a player who cannot
 * see the arrow following the pointer (desktop's grabbed ArrowDragItem /
 * ArrowAttachItem): which card it is for, how to pick from the keyboard and
 * that Escape cancels. The region stays mounted so screen readers pick up
 * each change; it goes quiet when the pick ends.
 */
export default function PendingTargetAnnouncer() {
  const { t } = useTranslation();
  const { pending } = usePendingTargetContext();
  let message = '';
  if (pending) {
    const name = pending.source.name || t('PendingTargetAnnouncer.thisCard');
    message = pending.kind === 'arrow'
      ? t('PendingTargetAnnouncer.arrow', { name })
      : t('PendingTargetAnnouncer.attach', { name });
  }
  return (
    <div aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
