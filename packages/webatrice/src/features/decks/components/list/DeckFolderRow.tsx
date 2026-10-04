import { useTranslation } from 'react-i18next';
import { Download, Folder, Globe, Share2, Trash2 } from 'lucide-react';

import type { DeckFolderEntry } from '../../deckFolders';
import { DeckVisibilityBadge } from './DeckVisibilityBadge';

export interface DeckFolderRowProps {
  folder: DeckFolderEntry;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
  /** Share the decks directly in the folder (Servatrice 3.1 only). */
  onShare?: () => void;
  /** Publish or unpublish the folder (Servatrice 3.1 only). */
  onTogglePublic?: () => void;
}

const ACTION_CLASS = [
  'p-2 rounded-md text-text-muted transition-all shrink-0',
  'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100',
].join(' ');

/** A subfolder in the list: opens on click; share, publish, download and delete on hover. */
export function DeckFolderRow({ folder, onOpen, onDownload, onDelete, onShare, onTogglePublic }: DeckFolderRowProps) {
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
        <DeckVisibilityBadge visibility={folder.visibility} kind="folder" />
      </button>
      {onShare && (
        <button
          type="button"
          onClick={onShare}
          disabled={folder.directDeckCount === 0}
          className={`${ACTION_CLASS} hover:text-text-primary hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed`}
          title={t('DeckSharing.shareDecks')}
          aria-label={t('DeckSharing.shareFolderNamed', { name: folder.name })}
        >
          <Share2 size={14} />
        </button>
      )}
      {onTogglePublic && (
        <button
          type="button"
          onClick={onTogglePublic}
          aria-pressed={folder.visibility === 'public'}
          className={`${ACTION_CLASS} hover:text-text-primary hover:bg-bg-elevated`}
          title={t('DeckSharing.publish')}
          aria-label={t('DeckSharing.publishNamed', { name: folder.name })}
        >
          <Globe size={14} />
        </button>
      )}
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
        className={`mr-2 ${ACTION_CLASS} hover:text-danger hover:bg-red-500/10`}
        title={t('DeckFolders.deleteFolder')}
        aria-label={t('DeckFolders.deleteFolderNamed', { name: folder.name })}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
