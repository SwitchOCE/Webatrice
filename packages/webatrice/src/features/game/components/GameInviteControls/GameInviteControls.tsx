import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, UserPlus } from 'lucide-react';

import { useGameInvite } from '../../hooks/useGameInvite';
import InviteToGameDialog from '../../dialogs/InviteToGameDialog/InviteToGameDialog';

interface GameInviteControlsProps {
  gameId: number;
  className?: string;
}

const BUTTON_CLASS = [
  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium',
  'text-text-primary bg-bg-elevated hover:bg-border-subtle border border-border-subtle',
  'disabled:opacity-60 disabled:cursor-not-allowed board-motion transition-colors',
].join(' ');

/**
 * Desktop's Game menu entries "Copy game link" and "Invite to Game..."
 * (tab_game.cpp aCopyGameLink / aInviteToGame). Both need a server link, so
 * they are disabled until the client knows which server it is on.
 */
export default function GameInviteControls({ gameId, className }: GameInviteControlsProps) {
  const { t } = useTranslation();
  const invite = useGameInvite(gameId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const disabled = !invite.link;

  return (
    <div className={['flex items-center gap-1.5', className ?? ''].join(' ')}>
      <button
        type="button"
        onClick={invite.copyLink}
        disabled={disabled}
        title={t('GameInvite.copyLink')}
        aria-label={t('GameInvite.copyLink')}
        className={BUTTON_CLASS}
      >
        <Link size={12} />
      </button>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={disabled}
        title={t('GameInvite.inviteToGame')}
        aria-label={t('GameInvite.inviteToGame')}
        className={BUTTON_CLASS}
      >
        <UserPlus size={12} /> {t('GameInvite.invite')}
      </button>
      <InviteToGameDialog
        isOpen={dialogOpen}
        onlyBuddies={invite.onlyBuddies}
        excludeNames={invite.excludeNames}
        onInvite={invite.sendInvite}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
