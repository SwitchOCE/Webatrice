import { useParams } from 'react-router-dom';

import { usePeer, type PeerViewModel } from '@app/feature-widgets/private-chat';

export type PlayerViewModel = PeerViewModel;

export function usePlayer(): PlayerViewModel {
  const params = useParams<{ name?: string }>();
  return usePeer(params.name ?? null);
}
