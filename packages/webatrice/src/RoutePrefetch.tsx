import { useEffect } from 'react';
import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { prefetchRoutes } from './lazyRoutes';
import { scheduleRoutePrefetch } from './utils/lazyRoute';

export default function RoutePrefetch() {
  const connected = useAppSelector(server.Selectors.getIsConnected);
  useEffect(() => {
    if (connected) {
      return scheduleRoutePrefetch(prefetchRoutes);
    }
  }, [connected]);
  return null;
}
