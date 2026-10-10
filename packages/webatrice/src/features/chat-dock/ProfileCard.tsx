import { forwardRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useNavigate } from 'react-router-dom';
import { Flag, Gamepad2, UserCircle, UserRoundMinus, UserRoundPlus, Volume2, VolumeX } from 'lucide-react';

import { Avatar, Button, UserBadges } from '@app/components';
import { useReportUser } from '@app/dialogs';
import { type PeerViewModel } from '@app/feature-widgets/private-chat';
import { useUserGames } from '@app/feature-widgets/user-games';
import { Images } from '@app/images';
import { RouteEnum } from '@app/types';
import { formatAccountAge, formatUserLevel } from '@app/utils';

import { countryName } from './countryName';

interface ProfileCardProps {
  name: string;
  peer: PeerViewModel;
  onDone: () => void;
}

const ProfileCard = forwardRef<HTMLDivElement, ProfileCardProps>(function ProfileCard({ name, peer, onDone }, ref) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const userGames = useUserGames();
  const { canReportUser, openReportUser } = useReportUser();
  const info = peer.userInfo;
  const cc = info?.country ?? '';
  const country = useMemo(() => countryName(cc, i18n.language), [cc, i18n.language]);
  const act = (fn: () => void) => () => {
    fn();
    onDone();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('ChatDock.profile.label', { name })}
      className="pointer-events-auto w-[300px] rounded-ui-lg border border-border-strong bg-bg-surface p-4 shadow-pop"
    >
      <div className="flex items-center gap-3">
        <Avatar name={name} size={48} src={peer.avatarUrl ?? undefined} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[15px] font-semibold text-text-primary">
            <span className="truncate">{name}</span>
            {cc && Images.Countries[cc] && (
              <img src={Images.Countries[cc]} alt={country} title={country} className="h-3 w-auto shrink-0 rounded-[2px]" />
            )}
            {info && <UserBadges userLevel={info.userLevel} size={13} />}
          </p>
          <p className="text-[12px] text-text-muted">
            {info
              ? [
                formatUserLevel(t, info.userLevel, info.privlevel),
                formatAccountAge(t, info.accountageSecs, info.userLevel, i18n.language),
              ].join(' · ')
              : t('ChatDock.profile.loading')}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {userGames && (
          <Button size="sm" icon={<Gamepad2 size={13} />} disabled={!peer.isOnline} onClick={act(() => userGames.open(name))}>
            {t('ChatDock.profile.showGames')}
          </Button>
        )}
        <Button
          size="sm"
          icon={<UserCircle size={13} />}
          onClick={act(() => navigate(generatePath(RouteEnum.PLAYER, { name })))}
        >
          {t('ChatDock.profile.openPage')}
        </Button>
        {peer.isABuddy ? (
          <Button size="sm" variant="quiet" icon={<UserRoundMinus size={13} />} disabled={!peer.canEditLists} onClick={peer.onRemoveBuddy}>
            {t('ChatDock.profile.removeBuddy')}
          </Button>
        ) : (
          <Button size="sm" variant="quiet" icon={<UserRoundPlus size={13} />} disabled={!peer.canEditLists} onClick={peer.onAddBuddy}>
            {t('ChatDock.profile.addBuddy')}
          </Button>
        )}
        {peer.isIgnored ? (
          <Button size="sm" variant="quiet" icon={<Volume2 size={13} />} disabled={!peer.canEditLists} onClick={peer.onRemoveIgnore}>
            {t('ChatDock.profile.unignore')}
          </Button>
        ) : (
          <Button size="sm" variant="quiet" icon={<VolumeX size={13} />} disabled={!peer.canEditLists} onClick={peer.onAddIgnore}>
            {t('ChatDock.profile.ignore')}
          </Button>
        )}
        {canReportUser(name) && (
          <Button
            size="sm"
            variant="quiet"
            icon={<Flag size={13} />}
            onClick={act(() => openReportUser({ userName: name, chatContext: peer.getChatContext() }))}
          >
            {t('ChatDock.profile.report')}
          </Button>
        )}
      </div>
    </div>
  );
});

export default ProfileCard;
