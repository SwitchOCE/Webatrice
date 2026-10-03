import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, Link, useNavigate, useParams } from 'react-router-dom';

import { Layout } from '@app/feature-wrappers/layout';
import { useOpenedReplays } from '@app/hooks';
import { closeReplay, type OpenedReplay } from '@app/services';
import { RouteEnum } from '@app/types';

import { GameBoard } from '../Game';
import { GameReadOnlyProvider } from '../components/ui/GameReadOnlyContext';
import ReplayControls from './ReplayControls';
import { useReplayPlayback } from './useReplayPlayback';

/**
 * Replay route: desktop's TabGame in replay mode. Renders the regular game board
 * read-only over the replay's local game, with the replay dock underneath. The
 * replay stays open (and its tab in the top bar) until the user closes it.
 */
function GameReplay() {
  const { t } = useTranslation();
  const { replayKey } = useParams<{ replayKey: string }>();
  const opened = useOpenedReplays().find((replay) => replay.key === replayKey);

  if (!opened) {
    return (
      <Layout>
        <div className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary" data-testid="replay-missing">
          <p>{t('GameReplay.missing')}</p>
          <Link className="text-accent underline" to={RouteEnum.REPLAYS}>{t('GameReplay.backToReplays')}</Link>
        </div>
      </Layout>
    );
  }

  // Keyed so switching between two replay tabs starts from the other replay's own state.
  return <ReplayView key={opened.key} opened={opened} />;
}

function ReplayView({ opened }: { opened: OpenedReplay }) {
  const navigate = useNavigate();
  const playback = useReplayPlayback(opened);

  // Desktop relabels "Leave game" to "Close replay" in replay mode.
  const closeReplayTab = useCallback(() => {
    navigate(generatePath(RouteEnum.REPLAYS));
    closeReplay(opened.key);
  }, [opened, navigate]);

  return (
    <GameReadOnlyProvider value>
      <GameBoard
        gameId={opened.gameId}
        onLeave={closeReplayTab}
        footer={<ReplayControls playback={playback} />}
      />
    </GameReadOnlyProvider>
  );
}

export default GameReplay;
