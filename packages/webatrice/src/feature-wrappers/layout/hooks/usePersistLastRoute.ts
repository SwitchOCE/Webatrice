import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { persistLastRoute } from '@app/services';

/** Saves the current route on every navigation, for AppShell to reopen after a reload. */
export function usePersistLastRoute(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    persistLastRoute(pathname);
  }, [pathname]);
}
