import { useTranslation } from 'react-i18next';

import { games } from '@cockatrice/datatrice';
import { GameCard } from '@app/components';
import { AlertDialog, ConfirmDialog, PromptDialog } from '@app/dialogs';
import { useCanOverrideGameRestrictions, useJoinGame, useJoinGameErrorMessage, useNavigateOnGameJoined } from '@app/hooks';
import { useAppSelector } from '@app/store';

import type { HomeData } from '../useHome';
import BuddyGames from './BuddyGames';
import type { RenderGameCard } from './GameGrid';
import OpenGames from './OpenGames';

export default function HomeGames({ home }: { home: HomeData }) {
  const { t } = useTranslation();
  const overrideRestrictions = useCanOverrideGameRestrictions();
  const activeGameIds = useAppSelector(games.Selectors.getActiveGameIds);
  const join = useJoinGame();
  const joinErrorMessage = useJoinGameErrorMessage(join.joinError);
  useNavigateOnGameJoined();

  const renderCard: RenderGameCard = (room, game) => (
    <GameCard
      game={game}
      gametypeMap={room.gametypeMap}
      overrideRestrictions={overrideRestrictions}
      alreadyJoined={activeGameIds.includes(game.info.gameId)}
      busy={join.joinPending}
      onJoin={(g) => join.beginJoin(room.info.roomId, g.info, false, false)}
      onSpectate={(g) => join.beginJoin(room.info.roomId, g.info, true, false)}
    />
  );

  const buddies = <BuddyGames key="buddies" home={home} renderCard={renderCard} />;
  const open = <OpenGames key="open" home={home} renderCard={renderCard} />;

  return (
    <>
      {home.buddyGames.length > 0 ? [buddies, open] : [open, buddies]}
      <ConfirmDialog
        cancelDefault
        title={t('GameLink.confirm.title')}
        message={t('GameLink.full')}
        confirmLabel={t('GameLink.yes')}
        cancelLabel={t('GameLink.no')}
        isOpen={join.spectatorConfirmationRequired}
        onConfirm={join.confirmSpectatorJoin}
        onCancel={join.cancelSpectatorJoin}
      />
      <PromptDialog
        isOpen={join.passwordRequired}
        title={t('HomeGames.passwordTitle')}
        label={t('Common.label.password')}
        type="password"
        submitLabel={t('Common.action.join')}
        onSubmit={join.submitPassword}
        onCancel={join.cancelPassword}
      />
      <AlertDialog
        isOpen={join.joinError !== null}
        title={t('HomeGames.errorTitle')}
        message={joinErrorMessage}
        onDismiss={join.clearJoinError}
      />
    </>
  );
}
