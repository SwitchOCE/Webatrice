import { ServerCapability, games, server } from '@cockatrice/datatrice';
import { PlaymatVisibility, usePlaymatSettings } from '@app/hooks';
import { useAppSelector } from '@app/store';

import { useGameId } from '../ui/GameIdContext';
import PlaymatArt from './PlaymatArt';

interface PlayerPlaymatProps {
  playerId: number;
  isSelf: boolean;
}

/**
 * The player's playmat (Cockatrice #7101) behind their battlefield: the
 * announced card's art, cropped by the playmat params and cover-fitted to the
 * area (PlaymatArt). Port of desktop PlayerGraphicsItem::updatePlaymat/paint,
 * honouring the "Playmat visibility" setting.
 */
export default function PlayerPlaymat({ playerId, isSelf }: PlayerPlaymatProps) {
  // Optional: PlayerBox also renders outside a live game (previews, specs).
  const gameId = useGameId();
  const supported = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.PLAYMATS));
  const playmat = useAppSelector((state) =>
    gameId == null ? null : games.Selectors.getPlayerPlaymat(state, gameId, playerId));
  const { visibility } = usePlaymatSettings();
  const visible = supported && playmat !== null
    && visibility !== PlaymatVisibility.NONE
    && (isSelf || visibility === PlaymatVisibility.ALL);

  if (!visible) {
    return null;
  }
  return <PlaymatArt art={playmat} testId="player-playmat" />;
}
