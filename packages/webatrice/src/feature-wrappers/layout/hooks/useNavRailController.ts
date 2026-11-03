import { useLocation } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { usePreference, useUnreadCounts } from '@app/hooks';

import { useStaffTools } from '../../staff/useStaffTools';
import { placeBadges, placeForPath, railPlaces, type NavPlace, type PlaceKey } from '../navPlaces';
import { usePlayPath } from './usePlayPath';

export interface NavRailController {
  places: NavPlace[];
  current: PlaceKey | null;
  badges: Partial<Record<PlaceKey, number>>;
}

export function useNavRailController(): NavRailController {
  const { pathname } = useLocation();
  const staff = useStaffTools();
  const queueLoaded = useAppSelector(server.Selectors.getReportQueueLoaded);
  const reportCounts = useAppSelector(server.Selectors.getReportQueueStatusCounts);
  const unresolvedReports = queueLoaded ? reportCounts.open + reportCounts.assigned : null;
  const badges = placeBadges(useUnreadCounts(), usePreference('playBadge'), unresolvedReports);
  const play = usePlayPath();

  return {
    places: railPlaces(staff.home, play),
    current: placeForPath(pathname),
    badges,
  };
}
