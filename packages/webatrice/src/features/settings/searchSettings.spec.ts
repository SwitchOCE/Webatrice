import { Bell } from 'lucide-react';

import { SettingsSectionId, type SettingsSection } from './registry';
import { scoreEntry, searchSettings } from './searchSettings';

const strings: Record<string, string> = {
  'page.sound': 'Sound',
  'page.shortcuts': 'Shortcuts',
  'group.sound': 'Sound settings',
  'group.misc': 'Miscellaneous',
  'label.enable': 'Enable sounds',
  'label.volume': 'Master volume',
  'label.theme': 'Current theme',
  'desc.theme': 'Which sound pack plays',
};
const t = (key: string) => strings[key] ?? key;

const sections: SettingsSection[] = [
  {
    id: SettingsSectionId.Sound,
    titleKey: 'page.sound',
    icon: Bell,
    groups: [
      {
        id: 'sound',
        titleKey: 'group.sound',
        entries: [
          { id: 'enable', labelKey: 'label.enable', control: { kind: 'toggle', key: 'soundEnabled' } },
          { id: 'volume', labelKey: 'label.volume', control: { kind: 'range', key: 'masterVolume', min: 0, max: 100 } },
        ],
      },
      {
        id: 'misc',
        titleKey: 'group.misc',
        entries: [
          {
            id: 'theme',
            labelKey: 'label.theme',
            descriptionKey: 'desc.theme',
            control: { kind: 'select', key: 'soundTheme', options: [] },
          },
        ],
      },
    ],
  },
  { id: SettingsSectionId.Shortcuts, titleKey: 'page.shortcuts', icon: Bell, component: () => null },
];

describe('scoreEntry', () => {
  it('ranks like desktop: label prefix, label, group prefix, group, other text', () => {
    expect(scoreEntry('mas', 'Master volume', 'Sound', '')).toBe(100);
    expect(scoreEntry('vol', 'Master volume', 'Sound', '')).toBe(80);
    expect(scoreEntry('sou', 'Master volume', 'Sound settings', '')).toBe(60);
    expect(scoreEntry('set', 'Master volume', 'Sound settings', '')).toBe(40);
    expect(scoreEntry('pack', 'Master volume', 'Sound', 'which sound pack')).toBe(20);
    expect(scoreEntry('zzz', 'Master volume', 'Sound', 'x')).toBe(0);
  });

  it('ignores case', () => {
    expect(scoreEntry('MASTER', 'master volume', '', '')).toBe(100);
  });
});

describe('searchSettings', () => {
  it('returns nothing for a blank query', () => {
    expect(searchSettings(sections, '   ', t)).toEqual({ hits: [], pages: [] });
  });

  it('orders hits by relevance', () => {
    const { hits } = searchSettings(sections, 'so', t);
    // Label contains (80), group prefix (60), description (20).
    expect(hits.map((h) => h.entry.id)).toEqual(['enable', 'volume', 'theme']);

    const ranked = searchSettings(sections, 'en', t).hits;
    expect(ranked[0].entry.id).toBe('enable');
  });

  it('matches descriptions and the page title', () => {
    expect(searchSettings(sections, 'pack', t).hits.map((h) => h.entry.id)).toEqual(['theme']);
    expect(searchSettings(sections, 'sound', t).hits).toHaveLength(3);
  });

  it('finds custom pages by title only', () => {
    expect(searchSettings(sections, 'short', t).pages.map((p) => p.id)).toEqual([SettingsSectionId.Shortcuts]);
    expect(searchSettings(sections, 'short', t).hits).toEqual([]);
  });
});
