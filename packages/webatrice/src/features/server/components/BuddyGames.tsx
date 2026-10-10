import { useTranslation } from 'react-i18next';

import { games, type Game } from '@cockatrice/datatrice';
import { Button, GameCard } from '@app/components';
import { AlertDialog, ConfirmDialog, PromptDialog } from '@app/dialogs';
import { useCanOverrideGameRestrictions, useJoinGame, useJoinGameErrorMessage, useNavigateOnGameJoined } from '@app/hooks';
import { useAppSelector } from '@app/store';

import type { HomeData } from '../useHome';
import SectionHead from './SectionHead';

export const BUDDY_GAMES_LIMIT = 6;

export default function BuddyGames({ home }: { home: HomeData }) {
  const { t } = useTranslation();
  const overrideRestrictions = useCanOverrideGameRestrictions();
  const activeGameIds = useAppSelector(games.Selectors.getActiveGameIds);
  const join = useJoinGame();
  const joinErrorMessage = useJoinGameErrorMessage(join.joinError);
  useNavigateOnGameJoined();

  const room = home.usualRoom;
  const shown = home.buddyGames.slice(0, BUDDY_GAMES_LIMIT);
  const begin = (roomId: number, game: Game, asSpectator: boolean) => join.beginJoin(roomId, game.info, asSpectator, false);

  let where: string | undefined;
  if (home.joinedRooms.length === 1) {
    where = t('BuddyGames.whereOne', { room: home.joinedRooms[0].info.name });
  } else if (home.joinedRooms.length > 1) {
    where = t('BuddyGames.whereMany', { count: home.joinedRooms.length });
  }

  let empty = t('BuddyGames.emptyNotJoined');
  if (home.buddyCount === 0) {
    empty = t('BuddyGames.emptyNoBuddies');
  } else if (home.joinedRooms.length > 0) {
    empty = t('BuddyGames.empty');
  }

  return (
    <section className="flex shrink-0 flex-col gap-2.5" aria-labelledby="home-buddy-games">
      <SectionHead
        id="home-buddy-games"
        title={t('BuddyGames.title')}
        count={where}
        action={room && home.usualRoomJoined && (
          <Button size="sm" variant="ghost" onClick={home.play}>
            {t('BuddyGames.allGames', { room: room.info.name })}
          </Button>
        )}
      />
      {shown.length === 0 ? (
        <p className="rounded-ui-lg border border-dashed border-border-subtle px-pad py-5 text-[13px] text-text-muted">{empty}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-gap">
          {shown.map(({ room: gameRoom, game }) => (
            <li key={`${gameRoom.info.roomId}:${game.info.gameId}`} className="flex min-w-0">
              <GameCard
                game={game}
                gametypeMap={gameRoom.gametypeMap}
                overrideRestrictions={overrideRestrictions}
                alreadyJoined={activeGameIds.includes(game.info.gameId)}
                busy={join.joinPending}
                onJoin={(g) => begin(gameRoom.info.roomId, g, false)}
                onSpectate={(g) => begin(gameRoom.info.roomId, g, true)}
              />
            </li>
          ))}
        </ul>
      )}
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
        title={t('BuddyGames.passwordTitle')}
        label={t('Common.label.password')}
        type="password"
        submitLabel={t('Common.action.join')}
        onSubmit={join.submitPassword}
        onCancel={join.cancelPassword}
      />
      <AlertDialog
        isOpen={join.joinError !== null}
        title={t('BuddyGames.errorTitle')}
        message={joinErrorMessage}
        onDismiss={join.clearJoinError}
      />
    </section>
  );
}
