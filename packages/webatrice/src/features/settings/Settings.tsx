import { KeyboardEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';

import { AuthGuard } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';

import type { SettingsSection, SettingsSectionId } from './registry';
import { searchSettings } from './searchSettings';
import { settingsSections } from './sections';
import SettingsSearchResults from './SettingsSearchResults';
import SettingsSectionView from './SettingsSectionView';

import './Settings.css';

interface SettingsProps {
  /** Registered pages; injectable for tests. */
  sections?: readonly SettingsSection[];
}

export const sectionTabId = (id: SettingsSectionId) => `settings-tab-${id}`;
export const sectionPanelId = 'settings-panel';

/**
 * Desktop's Settings dialog as a page: a searchable list of sections beside the selected one.
 * Every change is saved as it is made, as on desktop.
 */
const Settings = ({ sections = settingsSections }: SettingsProps) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<SettingsSectionId>(sections[0].id);
  const [query, setQuery] = useState('');
  const tabRefs = useRef(new Map<SettingsSectionId, HTMLButtonElement>());

  const selected = sections.find((section) => section.id === selectedId) ?? sections[0];
  const searching = query.trim() !== '';
  const results = useMemo(() => searchSettings(sections, query, t), [sections, query, t]);

  const openSection = (id: SettingsSectionId) => {
    setSelectedId(id);
    setQuery('');
  };

  // Roving focus for the vertical tab list (WAI-ARIA tabs pattern).
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    const jump = { Home: 0, End: sections.length - 1 }[event.key];
    if (step == null && jump == null) {
      return;
    }
    event.preventDefault();
    const next = sections[jump ?? (index + step! + sections.length) % sections.length];
    openSection(next.id);
    tabRefs.current.get(next.id)?.focus();
  };

  return (
    <Layout className="settings">
      <AuthGuard />
      <div className="settings__layout">
        <nav className="settings__nav">
          <label className="settings__search">
            <Search size={14} aria-hidden className="settings__search-icon" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Settings.searchPlaceholder')}
              aria-label={t('Settings.searchLabel')}
              aria-controls={sectionPanelId}
            />
          </label>
          <div role="tablist" aria-orientation="vertical" aria-label={t('Settings.title')} className="settings__tabs">
            {sections.map((section, index) => {
              const Icon = section.icon;
              const active = !searching && section.id === selected.id;
              return (
                <button
                  key={section.id}
                  ref={(el) => {
                    if (el) {
                      tabRefs.current.set(section.id, el);
                    } else {
                      tabRefs.current.delete(section.id);
                    }
                  }}
                  id={sectionTabId(section.id)}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={sectionPanelId}
                  tabIndex={section.id === selected.id ? 0 : -1}
                  className={active ? 'settings__tab settings__tab--active' : 'settings__tab'}
                  onClick={() => openSection(section.id)}
                  onKeyDown={(e) => onTabKeyDown(e, index)}
                >
                  <Icon size={16} aria-hidden />
                  {t(section.titleKey)}
                </button>
              );
            })}
          </div>
        </nav>
        <div
          id={sectionPanelId}
          role="tabpanel"
          aria-labelledby={searching ? undefined : sectionTabId(selected.id)}
          aria-label={searching ? t('Settings.searchResults') : undefined}
          className="settings__panel scrollable"
        >
          {searching ? (
            <SettingsSearchResults query={query.trim()} results={results} onOpenSection={openSection} />
          ) : (
            <SettingsSectionView key={selected.id} section={selected} />
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
