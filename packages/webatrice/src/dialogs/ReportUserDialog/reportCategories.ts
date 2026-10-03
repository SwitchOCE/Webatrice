/**
 * Canonical report category keys, in the order desktop's report dialog lists
 * them. Mirrors `libcockatrice_utility/.../report_categories.cpp`: the same
 * list is Servatrice's whitelist for `Command_Report.category`, so any other
 * key is rejected with RespInvalidData.
 */
export const REPORT_CATEGORIES = [
  'cheating',
  'bug_abuse',
  'harassment',
  'verbal_abuse',
  'hate_speech',
  'spam',
  'other',
] as const;

export type ReportCategory = typeof REPORT_CATEGORIES[number];
