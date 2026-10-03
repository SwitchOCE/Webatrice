import { z } from 'zod';
import type { TFunction } from 'i18next';

// Spin-box ranges from desktop's TabLog::createDock (tab_logs.cpp).
export const LOG_MAX_DAYS = 20;
export const LOG_MAX_RESULTS = 1000;

export const buildLogSearchSchema = (t: TFunction) =>
  z.object({
    userName: z.string(),
    ipAddress: z.string(),
    gameName: z.string(),
    gameId: z.string(),
    message: z.string(),
    logLocation: z.object({ room: z.boolean(), game: z.boolean(), chat: z.boolean() }),
    // '' = no radio picked yet (desktop's Clear Filters unchecks all three).
    dateRange: z.enum(['', 'pastDays', 'today', 'lastHour']),
    pastDays: z.number().int().min(0).max(LOG_MAX_DAYS),
    maximumResults: z.number().int().min(0).max(LOG_MAX_RESULTS),
  }).superRefine((values, ctx) => {
    // TabLog::getClicked checks these two, in this order, with these messages.
    // (Not on `root`: react-hook-form clears root errors before deciding to submit.)
    const filters = [values.userName, values.ipAddress, values.gameName, values.gameId, values.message];
    if (filters.every((value) => value.trim() === '')) {
      ctx.addIssue({ code: 'custom', path: ['userName'], message: t('LogSearchForm.error.noFilter') });
      return;
    }
    if (values.dateRange === 'pastDays' && values.pastDays === 0) {
      ctx.addIssue({ code: 'custom', path: ['pastDays'], message: t('LogSearchForm.error.noDays') });
    }
  });

export type LogSearchFormValues = z.infer<ReturnType<typeof buildLogSearchSchema>>;

export const LOG_SEARCH_DEFAULTS: LogSearchFormValues = {
  userName: '',
  ipAddress: '',
  gameName: '',
  gameId: '',
  message: '',
  logLocation: { room: false, game: false, chat: false },
  dateRange: '',
  pastDays: 0,
  maximumResults: 0,
};

/**
 * The defaults TabLog::getClicked writes back into an under-specified search:
 * no date range → the past 20 days, no location → all three (rooms and games only for the developer
 * family, which cannot read private chats), no maximum → 1000.
 */
export function applyLogSearchDefaults(values: LogSearchFormValues, developer = false): LogSearchFormValues {
  const next = { ...values, logLocation: { ...values.logLocation } };
  if (next.dateRange === '') {
    next.dateRange = 'pastDays';
    next.pastDays = LOG_MAX_DAYS;
  }
  if (!next.logLocation.room && !next.logLocation.game && !next.logLocation.chat) {
    next.logLocation = { room: true, game: true, chat: !developer };
  }
  if (next.maximumResults === 0) {
    next.maximumResults = LOG_MAX_RESULTS;
  }
  return next;
}

/** Command_ViewLogHistory.date_range as desktop computes it: a look-back in hours. */
export function logDateRangeHours({ dateRange, pastDays }: LogSearchFormValues): number {
  switch (dateRange) {
    case 'lastHour':
      return 1;
    case 'today':
      return 24;
    case 'pastDays':
      return pastDays * 24;
    default:
      return 0;
  }
}
