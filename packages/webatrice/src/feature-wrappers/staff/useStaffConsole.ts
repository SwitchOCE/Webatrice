import { useMemo } from 'react';
import { matchPath, useLocation } from 'react-router-dom';

import { server, ServerCapability } from '@cockatrice/datatrice';
import { isModerator, useAdminLock } from '@app/hooks';
import { useAppSelector } from '@app/store';

import { visibleStaffTools, type StaffTool, type StaffToolId } from './staffTools';

export interface StaffConsole {
  tools: StaffTool[];
  activeId: StaffToolId | null;
  unresolvedReports: number | null;
  showLock: boolean;
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

export function useStaffConsole(): StaffConsole {
  const { pathname } = useLocation();
  const userLevel = useAppSelector((state) => server.Selectors.getUser(state)?.userLevel ?? 0);
  const moderationTools = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.MODERATION_TOOLS));
  const cardArt = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.CARD_ART));
  const developerRole = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.DEVELOPER_ROLE));
  const queueLoaded = useAppSelector(server.Selectors.getReportQueueLoaded);
  const counts = useAppSelector(server.Selectors.getReportQueueStatusCounts);
  const [locked, setLocked] = useAdminLock();

  const tools = useMemo(() => {
    const supported: Partial<Record<ServerCapability, boolean>> = {
      [ServerCapability.MODERATION_TOOLS]: moderationTools,
      [ServerCapability.CARD_ART]: cardArt,
      [ServerCapability.DEVELOPER_ROLE]: developerRole,
    };
    return visibleStaffTools(userLevel, (capability) => supported[capability] ?? false);
  }, [userLevel, moderationTools, cardArt, developerRole]);

  const activeId = tools.find((tool) => matchPath({ path: tool.route, end: true }, pathname))?.id ?? null;

  return {
    tools,
    activeId,
    unresolvedReports: queueLoaded ? counts.open + counts.assigned : null,
    showLock: isModerator(userLevel),
    locked,
    setLocked,
  };
}
