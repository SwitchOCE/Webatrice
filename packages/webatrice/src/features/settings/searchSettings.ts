import type { SettingEntry, SettingsGroup, SettingsSection } from './registry';

export interface SettingsSearchHit {
  section: SettingsSection;
  group: SettingsGroup;
  entry: SettingEntry;
  score: number;
}

export interface SettingsSearchResult {
  hits: SettingsSearchHit[];
  /** Custom pages (e.g. Shortcuts) whose title matches; they are searched by title only. */
  pages: SettingsSection[];
}

type Translate = (key: string) => string;

/**
 * Desktop's relevance ranking (settings_search_model.cpp `relevanceScore`): a label that starts
 * with the query beats one that contains it, then the group title, then any other text.
 */
export function scoreEntry(query: string, label: string, groupTitle: string, otherText: string): number {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (l.startsWith(q)) {
    return 100;
  }
  if (l.includes(q)) {
    return 80;
  }
  const g = groupTitle.toLowerCase();
  if (g.startsWith(q)) {
    return 60;
  }
  if (g.includes(q)) {
    return 40;
  }
  return otherText.toLowerCase().includes(q) ? 20 : 0;
}

/** Matches the query against the translated text of every registered setting, best first. */
export function searchSettings(
  sections: readonly SettingsSection[],
  rawQuery: string,
  t: Translate,
): SettingsSearchResult {
  const query = rawQuery.trim();
  if (!query) {
    return { hits: [], pages: [] };
  }

  const hits: SettingsSearchHit[] = [];
  const pages: SettingsSection[] = [];
  for (const section of sections) {
    const sectionTitle = t(section.titleKey);
    if (section.component) {
      if (scoreEntry(query, sectionTitle, '', '') > 0) {
        pages.push(section);
      }
      continue;
    }
    for (const group of section.groups ?? []) {
      const groupTitle = t(group.titleKey);
      for (const entry of group.entries) {
        const other = [entry.descriptionKey ? t(entry.descriptionKey) : '', sectionTitle].join(' ');
        const score = scoreEntry(query, t(entry.labelKey), groupTitle, other);
        if (score > 0) {
          hits.push({ section, group, entry, score });
        }
      }
    }
  }
  // Array.prototype.sort is stable, so equal scores keep page order.
  hits.sort((a, b) => b.score - a.score);
  return { hits, pages };
}
