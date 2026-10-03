import { useTranslation } from 'react-i18next';
import { Download, Folder, Trash2 } from 'lucide-react';

import type { DeckFolderEntry } from '../../deckFolders';

export interface DeckFolderRowProps {
  folder: DeckFolderEntry;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
}

const ACTION_CLASS = [
  'p-2 rounded-md text-text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all shrink-0',
].join(' ');

/** A subfolder in the list: opens on click; download and delete on hover. */
export function DeckFolderRow({ folder, onOpen, onDownload, onDelete }: DeckFolderRowProps) {
  const { t } = useTranslation();
  return (
    <div className="group flex items-center gap-2 rounded-md bg-bg-surface border border-border-subtle hover:border-border-strong">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2 text-left cursor-pointer"
      >
        <Folder size={18} className="shrink-0 text-accent" />
        <span className="text-sm font-semibold text-text-primary truncate group-hover:text-accent">{folder.name}</span>
        <span className="text-xs text-text-muted tabular-nums">
          {t('DeckFolders.deckCount', { count: folder.deckCount })}
        </span>
      </button>
      <button
        type="button"
        onClick={onDownload}
        disabled={folder.deckCount === 0}
        className={`${ACTION_CLASS} hover:text-text-primary hover:bg-bg-elevated disabled:hidden`}
        title={t('DeckFolders.downloadFolder')}
        aria-label={t('DeckFolders.downloadFolderNamed', { name: folder.name })}
      >
        <Download size={14} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className={`mr-2 ${ACTION_CLASS} hover:text-red-400 hover:bg-red-500/10`}
        title={t('DeckFolders.deleteFolder')}
        aria-label={t('DeckFolders.deleteFolderNamed', { name: folder.name })}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
