import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import UnreadBadge from './UnreadBadge';
import { useNavRailController } from './hooks/useNavRailController';
import { PLACE_LABEL_KEYS } from './navPlaces';

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

export default function NavRail() {
  const { t } = useTranslation();
  const { places, current, badges } = useNavRailController();

  return (
    <div className="flex w-[76px] shrink-0 flex-col items-center justify-center border-r border-border-subtle bg-bg-surface">
      <nav aria-label={t('NavRail.label')} className="py-3">
        <ul className="flex flex-col items-center gap-1">
          {places.map(({ key, icon: Icon, to }) => {
            const active = current === key;
            return (
              <li key={key}>
                <Link
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'relative flex h-[58px] w-16 flex-col items-center justify-center gap-1 rounded-ui text-[11px] font-semibold',
                    focusRing,
                    active
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
                  ].join(' ')}
                >
                  {active && <span aria-hidden className="absolute -left-1.5 top-3 h-8 w-[3px] rounded-full bg-accent" />}
                  <Icon size={20} aria-hidden />
                  {t(PLACE_LABEL_KEYS[key])}
                  <UnreadBadge count={badges[key] ?? 0} className="absolute right-2 top-1.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
