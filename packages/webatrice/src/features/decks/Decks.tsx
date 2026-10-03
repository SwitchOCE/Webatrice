import { useCallback, useState } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { AuthGuard } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';
import { RouteEnum } from '@app/types';

import { DeckListHeader } from './components/list/DeckListHeader';
import { DeckListSections } from './components/list/DeckListSections';
import { DeckListEmpty, DeckListError, DeckListLoading } from './components/list/DeckListStates';
import type { FlatDeck } from './deckTree';
import { CreateDeckDialog } from './dialogs/CreateDeckDialog';
import { DeleteDeckDialog } from './dialogs/DeleteDeckDialog';
import { ImportDeckDialog } from './dialogs/ImportDeckDialog';
import { useDeckList } from './hooks/useDeckList';
import { useDeckListViewMode } from './hooks/useDeckListViewMode';

/**
 * My Decks route: the user's Servatrice deck storage, flattened into
 * format sections. Data and storage commands live in `useDeckList`; this
 * component owns navigation and which dialog is open.
 *
 *   • New deck / Import → upload at the storage root; the new deck opens
 *     in the editor when the server acknowledges it.
 *   • Row click → `/deck/:id`.
 *   • Delete → confirm → `deckDel(id)`; the reducer drops the row.
 */
function Decks() {
  const navigate = useNavigate();
  const openDeckById = useCallback(
    (deckId: number) => navigate(generatePath(RouteEnum.DECK, { deckId: String(deckId) })),
    [navigate],
  );
  const list = useDeckList({ onDeckCreated: openDeckById });
  const [viewMode, setViewMode] = useDeckListViewMode();

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FlatDeck | null>(null);

  const handleCreate = (name: string, format: string) => {
    if (!list.isConnected) {
      return;
    }
    setCreateOpen(false);
    list.createDeck(name, format);
  };

  const handleImport = (xml: string) => {
    if (!list.isConnected) {
      return;
    }
    setImportOpen(false);
    list.importDeck(xml);
  };

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    list.deleteDeck(pendingDelete);
    setPendingDelete(null);
  };

  return (
    <Layout>
      <AuthGuard />
      <div className="h-full flex flex-col bg-bg-base bg-purple-radial">
        <DeckListHeader
          loading={list.loading}
          deckCount={list.decks.length}
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
            {!list.loading && list.decks.length === 0 && (
              <DeckListEmpty onCreate={() => setCreateOpen(true)} disabled={!list.isConnected} />
            )}
            {!list.loading && list.decks.length > 0 && (
              <DeckListSections
                sections={list.sections}
                summaries={list.summaries}
                mode={viewMode}
                onOpen={(deck) => openDeckById(deck.id)}
                onDelete={setPendingDelete}
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
