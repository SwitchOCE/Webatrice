import { AuthGuard } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';

import BuddiesOnline from './components/BuddiesOnline';
import BuddyGames from './components/BuddyGames';
import HomeHero from './components/HomeHero';
import RecentDecks from './components/RecentDecks';
import ServerAnnouncement from './components/ServerAnnouncement';
import RoomsList from './RoomsList';
import { useHome } from './useHome';
import { useStartupRoom } from './useStartupRoom';

const Server = () => {
  const home = useHome();
  useStartupRoom();

  return (
    <Layout>
      <AuthGuard />
      <div
        className={[
          'grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-gap overflow-hidden bg-bg-base p-gap',
          'min-[1400px]:grid-cols-[minmax(0,1fr)_372px]',
        ].join(' ')}
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-gap overflow-y-auto">
          <HomeHero home={home} />
          <BuddyGames home={home} />
          <RecentDecks />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-gap overflow-y-auto">
          <ServerAnnouncement message={home.message} />
          <RoomsList rooms={home.roomList} joinedRoomIds={home.joinedRoomIds} onOpen={home.openRoom} />
          <BuddiesOnline buddies={home.buddiesOnline} buddyCount={home.buddyCount} />
        </div>
      </div>
    </Layout>
  );
};

export default Server;
