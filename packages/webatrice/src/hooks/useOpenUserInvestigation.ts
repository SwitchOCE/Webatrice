import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { RouteEnum } from '@app/types';

/** Query parameter of the Moderation route naming the user to investigate. */
export const INVESTIGATE_USER_PARAM = 'user';

/** The Moderation route, investigating `userName`. */
export function userInvestigationPath(userName: string): string {
  const params = new URLSearchParams({ [INVESTIGATE_USER_PARAM]: userName });
  return `${RouteEnum.MODERATION}?${params.toString()}`;
}

/**
 * Opens the Moderation page on `userName`, like desktop's "Investigate user"
 * context-menu action (`TabSupervisor::openTabModeration(userName)`): an open
 * Moderation page switches to the new user. Callers gate the entry the same way
 * the page is gated: moderator, and `server.Selectors.supports(state,
 * ServerCapability.MODERATION_TOOLS)`.
 */
export function useOpenUserInvestigation(): (userName: string) => void {
  const navigate = useNavigate();
  return useCallback((userName: string) => navigate(userInvestigationPath(userName)), [navigate]);
}
