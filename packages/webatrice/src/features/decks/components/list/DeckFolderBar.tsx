import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FolderPlus, HardDrive } from 'lucide-react';

import { deckPathCrumbs } from '../../deckFolders';

export interface DeckFolderBarProps {
  path: string;
  isConnected: boolean;
  onNavigate: (path: string) => void;
  onNewFolder: () => void;
}

/**
 * Where in deck storage the list is: a breadcrumb from the root to the
 * shown folder, and "New folder" (desktop's server-side "New folder",
 * created inside the shown folder).
 */
export function DeckFolderBar({ path, isConnected, onNavigate, onNewFolder }: DeckFolderBarProps) {
  const { t } = useTranslation();
  const crumbs = deckPathCrumbs(path);
  const crumbClass = 'px-1.5 py-0.5 rounded hover:bg-bg-elevated hover:text-text-primary transition-colors';

  return (
    <div className="flex items-center justify-between gap-2 mb-4">
      <nav aria-label={t('DeckFolders.location')} className="min-w-0">
        <ol className="flex items-center flex-wrap gap-0.5 text-sm text-text-secondary">
          <li>
            <button
              type="button"
              onClick={() => onNavigate('')}
              aria-current={path === '' ? 'location' : undefined}
              className={`inline-flex items-center gap-1 ${crumbClass}`}
            >
              <HardDrive size={13} /> {t('DeckFolders.root')}
            </button>
          </li>
          {crumbs.map((crumb) => (
            <Fragment key={crumb.path}>
              <li aria-hidden className="text-text-muted"><ChevronRight size={12} /></li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate(crumb.path)}
                  aria-current={crumb.path === path ? 'location' : undefined}
                  className={`${crumbClass} ${crumb.path === path ? 'font-semibold text-text-primary' : ''}`}
                >
                  {crumb.name}
                </button>
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>
      <button
        type="button"
        onClick={onNewFolder}
        disabled={!isConnected}
        className={[
          'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border-strong',
          'bg-bg-elevated text-sm text-text-primary hover:bg-border-subtle disabled:opacity-40',
        ].join(' ')}
      >
        <FolderPlus size={13} /> {t('DeckFolders.newFolder')}
      </button>
    </div>
  );
}
