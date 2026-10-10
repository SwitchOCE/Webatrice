import { Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Panel } from '@app/components';

const MESSAGE_CLASS = [
  'max-h-[156px] overflow-y-auto text-[13px] leading-relaxed text-text-secondary',
  '[&_a]:text-accent [&_a]:underline [&_a]:decoration-accent/40 [&_a]:underline-offset-2 [&_a:hover]:decoration-accent',
  '[&_p]:my-1 [&_b]:text-text-primary [&_strong]:text-text-primary',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
].join(' ');

export default function ServerAnnouncement({ message }: { message: string | null }) {
  const { t } = useTranslation();
  return (
    <Panel
      eyebrow
      className="shrink-0"
      title={(
        <span className="inline-flex items-center gap-2">
          <Megaphone size={14} className="text-text-muted" aria-hidden /> {t('ServerAnnouncement.title')}
        </span>
      )}
    >
      {message ? (
        <div
          tabIndex={0}
          role="region"
          aria-label={t('ServerAnnouncement.title')}
          className={MESSAGE_CLASS}
          dangerouslySetInnerHTML={{ __html: message }}
        />
      ) : (
        <p className="text-[13px] text-text-muted">{t('ServerAnnouncement.empty')}</p>
      )}
    </Panel>
  );
}
