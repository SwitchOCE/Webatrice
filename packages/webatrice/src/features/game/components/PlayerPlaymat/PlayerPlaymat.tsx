import { useEffect, useRef, useState } from 'react';

import { ServerCapability, games, server } from '@cockatrice/datatrice';
import { PlaymatVisibility, usePlaymatSettings } from '@app/hooks';
import { PlaymatImage } from '@app/components';
import { useAppSelector } from '@app/store';

import { useGameId } from '../ui/GameIdContext';
import { type Size } from '@app/utils';

interface PlayerPlaymatProps {
  playerId: number;
  isSelf: boolean;
}

/**
 * The player's playmat (Cockatrice #7101) behind their battlefield: the
 * announced card's art, cropped by the playmat params and cover-fitted to the
 * area. Port of desktop PlayerGraphicsItem::updatePlaymat/paint, honouring the
 * "Playmat visibility" setting. Fills its positioned parent and ignores the
 * pointer, so it can sit under the board without affecting its layout.
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

  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Size | null>(null);
  useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const measure = () => setArea({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible]);

  if (!visible) {
    return null;
  }


  return (
    <div
      ref={areaRef}
      data-testid="player-playmat"
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <PlaymatImage playmat={playmat} area={area} />
    </div>
  );
}
