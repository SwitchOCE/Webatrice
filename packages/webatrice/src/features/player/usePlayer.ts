import { useParams } from 'react-router-dom';

import { usePeer, type PeerViewModel } from '@app/feature-widgets/chat-dock';

export type PlayerViewModel = PeerViewModel;

export function usePlayer(): PlayerViewModel {
  const params = useParams<{ name?: string }>();
  return usePeer(params.name ?? null);
}
