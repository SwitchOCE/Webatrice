import { useCallback, useEffect, useRef, useState } from 'react';
import { generatePath, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { AuthGuard } from '@app/components';
import { AlertDialog } from '@app/dialogs';
import { ShortcutScope, useShortcut } from '@app/feature-widgets/shortcuts';
import { Layout } from '@app/feature-wrappers/layout';
import { RouteEnum } from '@app/types';

import { DeckFolderBar } from './components/list/DeckFolderBar';
import { DeckFolderRow } from './components/list/DeckFolderRow';
import { DeckListHeader } from './components/list/DeckListHeader';
import { DeckListSections } from './components/list/DeckListSections';
import { DeckListEmpty, DeckListError, DeckListLoading, DeckStorageError } from './components/list/DeckListStates';
import type { DeckFolderEntry } from './deckFolders';
import { deckShareQuery, type DeckShareLink } from './deckSharing';
import type { DecksLocationState } from './deckShortcuts';
import type { FlatDeck } from './deckTree';
import { CreateDeckDialog } from './dialogs/CreateDeckDialog';
import { CreateFolderDialog } from './dialogs/CreateFolderDialog';
import { DeleteDeckDialog } from './dialogs/DeleteDeckDialog';
import { DeckShareLinksDialog } from './dialogs/DeckShareLinksDialog';
import { DeleteFolderDialog } from './dialogs/DeleteFolderDialog';
import { ImportDeckDialog } from './dialogs/ImportDeckDialog';
import { MoveDeckDialog } from './dialogs/MoveDeckDialog';
import { OpenShareLinkDialog } from './dialogs/OpenShareLinkDialog';
import { ShareDeckDialog } from './dialogs/ShareDeckDialog';
import { useDeckDeleteFocus } from './hooks/useDeckDeleteFocus';
import { useDeckFileDownloads } from './hooks/useDeckFileDownloads';
import { useDeckList } from './hooks/useDeckList';
import { useDeckListViewMode } from './hooks/useDeckListViewMode';
import { useDeckShareCreate, useDeckSharingSupported, useDeckVisibility } from './hooks/useDeckSharing';
import { useDeckShareLinks } from './hooks/useDeckShareLinks';

const FOLDER_PARAM = 'folder';

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

  const sharingSupported = useDeckSharingSupported();
  const share = useDeckShareCreate();
  const visibility = useDeckVisibility();
  const [shareTarget, setShareTarget] = useState<{ deckId: number } | { folderPath: string } | null>(null);
  const [shareLinksOpen, setShareLinksOpen] = useState(false);
  const [openLinkOpen, setOpenLinkOpen] = useState(false);

  const location = useLocation();
  useEffect(() => {
    const open = (location.state as DecksLocationState | null)?.open;
    if (open === 'create') {
      setCreateOpen(true);
    } else if (open === 'import') {
      setImportOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per navigation, not on every state read
  }, [location.key]);
  useShortcut('deck.new', () => setCreateOpen(true), { scope: ShortcutScope.DECK_EDITOR, enabled: list.isConnected });
  useShortcut('deck.load', () => setImportOpen(true), { scope: ShortcutScope.DECK_EDITOR, enabled: list.isConnected });
  const shareLinks = useDeckShareLinks(shareLinksOpen);

  const startShare = (target: { deckId: number } | { folderPath: string }) => {
    share.reset();
    setShareTarget(target);
  };

  const createShare = (name: string) => {
    if (!shareTarget || !list.isConnected) {
      return;
    }
    share.create('folderPath' in shareTarget
      ? { name, folderPath: shareTarget.folderPath }
      : { name, items: [{ deckId: shareTarget.deckId }] });
  };

  const openShareLink = (link: DeckShareLink) => {
    setOpenLinkOpen(false);
    navigate({ pathname: RouteEnum.SHARED_DECK, search: `?${deckShareQuery(link)}` });
  };

  const openFolder = (path: string) => {
    setSearchParams(path ? { [FOLDER_PARAM]: path } : {});
  };

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

  const listRef = useRef<HTMLDivElement>(null);
  const focusAfterDelete = useDeckDeleteFocus(list.sections, listRef);

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    focusAfterDelete(pendingDelete);
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
          onOpenShareLink={sharingSupported ? () => setOpenLinkOpen(true) : undefined}
          onShareLinks={sharingSupported ? () => setShareLinksOpen(true) : undefined}
        />

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div ref={listRef} className="max-w-4xl mx-auto focus:outline-none">
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
                      onShare={sharingSupported ? () => startShare({ folderPath: entry.path }) : undefined}
                      onTogglePublic={sharingSupported
                        ? () => visibility.toggle({ folderPath: entry.path }, entry.visibility)
                        : undefined}
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
                documents={list.documents}
                onDetailsSaved={list.detailsSaved}
                mode={viewMode}
                onOpen={(deck) => openDeckById(deck.id)}
                onDelete={setPendingDelete}
                onMove={canMove ? setPendingMove : undefined}
                onDownload={(deck) => files.download([deck], deck.path)}
                onShare={sharingSupported ? (deck) => startShare({ deckId: deck.id }) : undefined}
                onTogglePublic={sharingSupported
                  ? (deck) => visibility.toggle({ deckId: deck.id }, deck.visibility)
                  : undefined}
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

      <ShareDeckDialog
        open={shareTarget != null}
        defaultName={t('DeckSharing.defaultDecksName')}
        state={share.state}
        onClose={() => {
          share.reset();
          setShareTarget(null);
        }}
        onCreate={createShare}
      />

      {shareLinksOpen && (
        <DeckShareLinksDialog
          shares={shareLinks.shares}
          error={shareLinks.error}
          pending={shareLinks.pending}
          onRevoke={shareLinks.revoke}
          onClose={() => setShareLinksOpen(false)}
        />
      )}

      <OpenShareLinkDialog open={openLinkOpen} onClose={() => setOpenLinkOpen(false)} onOpen={openShareLink} />

      <AlertDialog
        isOpen={visibility.error != null}
        title={t('DeckSharing.error')}
        message={visibility.error ?? ''}
        onDismiss={visibility.clearError}
      />
    </Layout>
  );
}

export default Decks;
