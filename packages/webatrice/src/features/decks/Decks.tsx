import { useCallback, useState } from 'react';
import { generatePath, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { AuthGuard } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';
import { RouteEnum } from '@app/types';

import { DeckFolderBar } from './components/list/DeckFolderBar';
import { DeckFolderRow } from './components/list/DeckFolderRow';
import { DeckListHeader } from './components/list/DeckListHeader';
import { DeckListSections } from './components/list/DeckListSections';
import { DeckListEmpty, DeckListError, DeckListLoading, DeckStorageError } from './components/list/DeckListStates';
import type { DeckFolderEntry } from './deckFolders';
import type { FlatDeck } from './deckTree';
import { CreateDeckDialog } from './dialogs/CreateDeckDialog';
import { CreateFolderDialog } from './dialogs/CreateFolderDialog';
import { DeleteDeckDialog } from './dialogs/DeleteDeckDialog';
import { DeleteFolderDialog } from './dialogs/DeleteFolderDialog';
import { ImportDeckDialog } from './dialogs/ImportDeckDialog';
import { MoveDeckDialog } from './dialogs/MoveDeckDialog';
import { useDeckFileDownloads } from './hooks/useDeckFileDownloads';
import { useDeckList } from './hooks/useDeckList';
import { useDeckListViewMode } from './hooks/useDeckListViewMode';

/** The `?folder=` search parameter holds the shown folder's path. */
const FOLDER_PARAM = 'folder';

/**
 * My Decks route: the user's Servatrice deck storage, one folder at a time
 * (desktop's remote tree in `TabDeckStorage`), its decks bucketed by format.
 * Data and storage commands live in `useDeckList`; this component owns
 * navigation and which dialog is open.
 *
 *   • Folder row → open it (`?folder=a/b`, so Back works); breadcrumb → up.
 *   • New deck / Import → upload into the shown folder; the new deck opens
 *     in the editor when the server acknowledges it.
 *   • New folder / delete folder (confirming what it holds) / move a deck /
 *     download a deck or a folder as `.cod` files.
 *   • Row click → `/deck/:id`. Delete → confirm → `deckDel(id)`.
 */
function Decks() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPath = searchParams.get(FOLDER_PARAM) ?? '';

  const openDeckById = useCallback(
    (deckId: number) => navigate(generatePath(RouteEnum.DECK, { deckId: String(deckId) })),
    [navigate],
  );
  const list = useDeckList({ onDeckCreated: openDeckById, folderPath: requestedPath });
  const files = useDeckFileDownloads();
  const [viewMode, setViewMode] = useDeckListViewMode();

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FlatDeck | null>(null);
  const [pendingFolderDelete, setPendingFolderDelete] = useState<DeckFolderEntry | null>(null);
  const [pendingMove, setPendingMove] = useState<FlatDeck | null>(null);

  const openFolder = (path: string) => {
    setSearchParams(path ? { [FOLDER_PARAM]: path } : {});
  };

  // A dialog stays open (keeping what was typed) when the hook refuses
  // because the connection dropped.
  const handleCreate = (name: string, format: string) => {
    if (list.createDeck(name, format)) {
      setCreateOpen(false);
    }
  };

  const handleImport = (xml: string, colorIdentity: string) => {
    if (list.importDeck(xml, colorIdentity)) {
      setImportOpen(false);
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    list.deleteDeck(pendingDelete);
    setPendingDelete(null);
  };

  const confirmFolderDelete = () => {
    if (!pendingFolderDelete) {
      return;
    }
    list.deleteFolder(pendingFolderDelete.path);
    setPendingFolderDelete(null);
  };

  const { folder } = list;
  const isEmpty = folder.decks.length === 0 && folder.folders.length === 0;
  const canMove = list.folderPaths.length > 1;

  return (
    <Layout>
      <AuthGuard />
      <div className="h-full flex flex-col bg-bg-base bg-purple-radial">
        <DeckListHeader
          loading={list.loading}
          deckCount={list.deckTotal}
          isConnected={list.isConnected}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onRefresh={list.refresh}
          onImport={() => setImportOpen(true)}
          onCreate={() => setCreateOpen(true)}
        />

        {/* Capped at max-w-4xl so rows don't stretch across ultrawide monitors. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="max-w-4xl mx-auto">
            {list.loading && !list.listError && <DeckListLoading />}
            {list.loading && list.listError && <DeckListError message={list.listError} onRetry={list.refresh} />}
            {list.storageError && <DeckStorageError message={list.storageError} onDismiss={list.dismissStorageError} />}
            {!list.loading && (
              <DeckFolderBar
                path={folder.path}
                isConnected={list.isConnected}
                onNavigate={openFolder}
                onNewFolder={() => setNewFolderOpen(true)}
              />
            )}
            {!list.loading && folder.folders.length > 0 && (
              <ul className="space-y-2 mb-6">
                {folder.folders.map((entry) => (
                  <li key={entry.path}>
                    <DeckFolderRow
                      folder={entry}
                      onOpen={() => openFolder(entry.path)}
                      onDownload={() => files.download(list.decksUnder(entry.path), entry.path)}
                      onDelete={() => setPendingFolderDelete(entry)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {!list.loading && isEmpty && folder.path === '' && (
              <DeckListEmpty onCreate={() => setCreateOpen(true)} disabled={!list.isConnected} />
            )}
            {!list.loading && isEmpty && folder.path !== '' && (
              <p className="text-sm text-text-muted">{t('DeckFolders.empty')}</p>
            )}
            {!list.loading && folder.decks.length > 0 && (
              <DeckListSections
                sections={list.sections}
                summaries={list.summaries}
                mode={viewMode}
                onOpen={(deck) => openDeckById(deck.id)}
                onDelete={setPendingDelete}
                onMove={canMove ? setPendingMove : undefined}
                onDownload={(deck) => files.download([deck], deck.path)}
              />
            )}
          </div>
        </div>
      </div>

      {pendingDelete && (
        <DeleteDeckDialog
          deckName={pendingDelete.name}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

      {pendingFolderDelete && (
        <DeleteFolderDialog
          folder={pendingFolderDelete}
          onCancel={() => setPendingFolderDelete(null)}
          onConfirm={confirmFolderDelete}
        />
      )}

      {pendingMove && (
        <MoveDeckDialog
          deck={pendingMove}
          folderPaths={list.folderPaths}
          onCancel={() => setPendingMove(null)}
          onMove={(target) => {
            list.moveDeck(pendingMove, target);
            setPendingMove(null);
          }}
        />
      )}

      <CreateFolderDialog
        open={newFolderOpen}
        parentPath={folder.path}
        siblings={folder.folders.map((f) => f.name)}
        onClose={() => setNewFolderOpen(false)}
        onCreate={(name) => {
          list.createFolder(name);
          setNewFolderOpen(false);
        }}
      />

      <ImportDeckDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />

      <CreateDeckDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </Layout>
  );
}

export default Decks;
