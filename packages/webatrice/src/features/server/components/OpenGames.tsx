import { Plus, Swords } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@app/components';

import type { HomeData } from '../useHome';
import GameGrid, { type RenderGameCard } from './GameGrid';
import HomeEmpty from './HomeEmpty';
import SectionHead from './SectionHead';

export default function OpenGames({ home, renderCard }: { home: HomeData; renderCard: RenderGameCard }) {
  const { t } = useTranslation();
  const room = home.usualRoom;
  if (!room || !home.usualRoomJoined) {
    return null;
  }
  const name = room.info.name;

  return (
    <section className="flex shrink-0 flex-col gap-2.5 pt-3" aria-labelledby="home-open-games">
      <SectionHead
        id="home-open-games"
        title={<Trans i18nKey="OpenGames.title" values={{ room: name }} components={{ room: <span className="text-accent" /> }} />}
      />
      {home.openGames.length === 0 ? (
        <HomeEmpty
          icon={<Swords size={17} />}
          actions={(
            <Button size="sm" icon={<Plus size={14} aria-hidden />} onClick={home.createGame}>
              {t('OpenGames.createGame')}
            </Button>
          )}
        >
          {t('OpenGames.empty', { room: name })}
        </HomeEmpty>
      ) : (
        <GameGrid>
          {home.openGames.map((game) => (
            <li key={game.info.gameId} className="flex min-w-0">
              {renderCard(room, game)}
            </li>
          ))}
        </GameGrid>
      )}
    </section>
  );
}
