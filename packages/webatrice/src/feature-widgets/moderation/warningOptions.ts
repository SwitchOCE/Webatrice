import type { Response_WarnList } from '@cockatrice/sockatrice/generated';

import type { WarningOption } from './WarnUserDialog';

/**
 * UserContextMenu::warnUser_processGetWarningsListResponse: pair each reason
 * with its starting level, defaulting to 1 when the server sent fewer levels
 * (3.0 servers send none).
 */
export function toWarningOptions(warnList: Response_WarnList | undefined): WarningOption[] {
  if (!warnList) {
    return [];
  }
  return warnList.warning.map((warning, i) => ({
    warning: warning.trim(),
    startingIl: i < warnList.warningIl.length ? warnList.warningIl[i] : 1,
  }));
}
