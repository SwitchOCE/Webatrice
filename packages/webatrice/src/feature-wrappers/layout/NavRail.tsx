import { generatePath, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Images } from '@app/images';
import { DebugLogDialog } from '@app/dialogs';
import { RouteEnum } from '@app/types';
import { CardImportDialog } from '@app/feature-widgets/card-import';

import LatencyStatus from './LatencyStatus';
import UnreadBadge from './UnreadBadge';
import UserMenu from './UserMenu';
import { useNavRailController } from './hooks/useNavRailController';
import { NAV_PLACES, PLACE_LABEL_KEYS } from './navPlaces';
import { UserMenuDialog } from './userMenuEntries';

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

export default function NavRail() {
  const { t } = useTranslation();
  const { current, badges, account, openDialog, closeDialog } = useNavRailController();

  return (
    <div
      className="flex w-[76px] shrink-0 flex-col items-center border-r border-border-subtle bg-bg-surface pb-2 pt-2.5"
    >
      <Link
        to={generatePath(RouteEnum.SERVER)}
        aria-label={t('NavRail.home')}
        className={`mb-3 rounded-ui ${focusRing}`}
      >
        <img src={Images.Logo} alt="" className="h-[34px] w-[34px] rounded-ui-sm" />
      </Link>
      <nav aria-label={t('NavRail.label')}>
        <ul className="flex flex-col items-center gap-1">
          {NAV_PLACES.map(({ key, icon: Icon, route }) => {
            const active = current === key;
            return (
              <li key={key}>
                <Link
                  to={generatePath(route)}
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
      <div className="mt-auto flex flex-col items-center gap-2">
        <LatencyStatus />
        <UserMenu {...account} />
      </div>
      <CardImportDialog
        isOpen={openDialog === UserMenuDialog.CardImport}
        handleClose={closeDialog}
      />
      <DebugLogDialog isOpen={openDialog === UserMenuDialog.DebugLog} onClose={closeDialog} />
    </div>
  );
}
