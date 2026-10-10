import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';

import type { SettingsSectionId } from './registry';
import type { SettingsSearchResult } from './searchSettings';
import { SettingsGroupBox } from './SettingsSectionView';

interface SettingsSearchResultsProps {
  query: string;
  results: SettingsSearchResult;
  onOpenSection: (id: SettingsSectionId) => void;
}

export default function SettingsSearchResults({ query, results, onOpenSection }: SettingsSearchResultsProps) {
  const { t } = useTranslation();
  const { hits, pages } = results;

  if (hits.length === 0 && pages.length === 0) {
    return <p className="settings__empty">{t('Settings.noResults', { query })}</p>;
  }

  const boxes: { key: string; hits: typeof hits }[] = [];
  for (const hit of hits) {
    const key = `${hit.section.id}/${hit.group.id}`;
    const box = boxes.find((b) => b.key === key);
    if (box) {
      box.hits.push(hit);
    } else {
      boxes.push({ key, hits: [hit] });
    }
  }

  return (
    <div className="settings-section">
      {pages.map((page) => (
        <button key={page.id} type="button" className="settings-page-link" onClick={() => onOpenSection(page.id)}>
          {t('Settings.openSection', { section: t(page.titleKey) })}
          <ArrowRight size={14} aria-hidden />
        </button>
      ))}
      {boxes.map(({ key, hits: boxHits }) => (
        <SettingsGroupBox
          key={key}
          group={boxHits[0].group}
          entries={boxHits.map((hit) => hit.entry)}
          caption={t(boxHits[0].section.titleKey)}
        />
      ))}
    </div>
  );
}
