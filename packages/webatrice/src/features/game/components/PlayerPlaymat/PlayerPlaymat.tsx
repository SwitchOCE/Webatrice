import { useEffect, useRef, useState } from 'react';

import { ScryfallImageSize, ServerCapability, games, server } from '@cockatrice/datatrice';
import { PlaymatVisibility, usePlaymatSettings } from '@app/hooks';
import { getScryfallUrl } from '@app/services';
import { useAppSelector } from '@app/store';

import { useGameId } from '../ui/GameIdContext';
import { playmatImageBox, type Size } from '@app/utils';

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
  const [card, setCard] = useState<Size | null>(null);

  const src = playmat
    ? getScryfallUrl({ providerId: playmat.cardProviderId, name: playmat.cardName }, ScryfallImageSize.Large)
    : null;

  useEffect(() => {
    setCard(null);
  }, [src]);

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

  if (!visible || !src) {
    return null;
  }

  const box = card && area ? playmatImageBox(card, playmat.params, area) : null;

  return (
    <div
      ref={areaRef}
      data-testid="player-playmat"
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        draggable={false}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          setCard({ width: naturalWidth, height: naturalHeight });
        }}
        className="absolute max-w-none"
        style={box
          ? { left: box.x, top: box.y, width: box.width, height: box.height }
          // Hidden until the art's natural size is known and the crop can be placed.
          : { visibility: 'hidden' }}
      />
    </div>
  );
}
