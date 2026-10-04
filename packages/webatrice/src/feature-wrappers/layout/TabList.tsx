import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  User, Home as HomeIcon, Swords, Library, LibraryBig,
  UserCircle2, Settings as SettingsIcon, FileText, X,
  Keyboard, ShieldCheck, Flag, Film,
  type LucideIcon,
} from 'lucide-react';

import { tabTitle, type Tab, type TabType } from './topBarTabs';

const TYPE_ICON: Record<TabType, LucideIcon> = {
  server: HomeIcon,
  room: HomeIcon,
  game: Swords,
  decks: LibraryBig,
  deck: Library,
  'my-decks': LibraryBig,
  settings: SettingsIcon,
  shortcuts: Keyboard,
  account: UserCircle2,
  logs: FileText,
  player: User,
  staff: ShieldCheck,
  replays: Film,
  replay: Film,
  'my-reports': Flag,
  unknown: FileText,
};

export interface TabListProps {
  tabs: Tab[];
  activeKey: string;
  onClose: (tab: Tab) => void;
}

/**
 * The open rooms, games, replays and pages. Each tab is a route, so this is
 * page navigation (links with aria-current), not an ARIA tablist: there are no
 * tab panels and every tab is reachable with Tab. The current tab comes from
 * `activeKey` rather than NavLink's own matching, which can't express the
 * fall-back to the Lobby. Close is a sibling button, never nested in the link.
 */
export default function TabList({ tabs, activeKey, onClose }: TabListProps) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('TopBar.tabs.label')} className="h-full">
      <ul className="flex items-end h-full gap-0.5 overflow-x-auto overflow-y-hidden min-w-0">
        {tabs.map((tab) => {
          const Icon = TYPE_ICON[tab.type];
          const active = tab.key === activeKey;
          return (
            <li
              key={tab.key}
              // Middle-click closes, like desktop's tab bar (and instead of
              // opening the link in a new browser tab).
              onAuxClick={(e) => {
                if (e.button === 1 && tab.closeable) {
                  e.preventDefault();
                  onClose(tab);
                }
              }}
              className={[
                'group relative flex items-center gap-2 h-9 pr-2 rounded-t-md',
                'select-none min-w-[140px] max-w-[220px] shrink-0 transition-colors',
                active
                  ? 'bg-bg-base text-text-primary border border-b-0 border-border-subtle'
                  : 'bg-bg-elevated/40 text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
              ].join(' ')}
            >
              <Link
                to={tab.route}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex-1 min-w-0 self-stretch flex items-center gap-2 pl-3 rounded-t-md',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                ].join(' ')}
              >
                <Icon size={14} aria-hidden className={active ? 'text-accent' : 'text-text-muted'} />
                <span className="flex-1 text-sm truncate">{tabTitle(tab, t)}</span>
              </Link>
              {tab.closeable ? (
                <button
                  type="button"
                  onClick={() => onClose(tab)}
                  // Never dimmed: the icon needs its full 3:1 against the tab.
                  className="p-0.5 rounded hover:bg-border-subtle text-text-muted hover:text-text-primary"
                  title={t('TopBar.tabs.close', { title: tabTitle(tab, t) })}
                  aria-label={t('TopBar.tabs.close', { title: tabTitle(tab, t) })}
                >
                  <X size={12} aria-hidden />
                </button>
              ) : (
                <span className="w-4" aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
