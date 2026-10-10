import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PanelRight, X } from 'lucide-react';

import { server } from '@cockatrice/datatrice';

import { AuthGuard, IconButton, SectionLabel } from '@app/components';
import { useRecordRecentDeck } from '@app/hooks';
import { readDeckPlaymat } from '@app/services';
import { AlertDialog } from '@app/dialogs';
import { ShortcutScope, useShortcut } from '@app/feature-widgets/shortcuts';
import { Layout } from '@app/feature-wrappers/layout';
import { useAppSelector } from '@app/store';
import { isCommanderFormat, isMtgFormat, RouteEnum } from '@app/types';

import { DeckBreakdown } from './components/breakdown/DeckBreakdown';
import CardSearchDock from './components/CardSearchDock/CardSearchDock';
import { DeckEditorHeader } from './components/editor/DeckEditorHeader';
import { DeckEditorSkeleton, DeckNotFound } from './components/editor/DeckEditorShells';
import { DeckHistoryControls } from './components/editor/DeckHistoryControls';
import { DeckInspector } from './components/editor/DeckInspector';
import { DeckLegalitySummary } from './components/editor/DeckLegalitySummary';
import { DeckMainPane } from './components/editor/DeckMainPane';
import { dockColorIdentity, type InspectedCard } from './components/editor/editorSelection';
import { PlainAddCard } from './components/editor/PlainCardList';
import { SampleHandPanel } from './components/editor/SampleHandPanel';
import { groupDeckCards } from './deckGrouping';
import { deckColorIdentity, serializeDeckForSave } from './deckPersistence';
import { isBlankDeck } from './deckSharing';
import type { DecksLocationState } from './deckShortcuts';
import { readDeckTags } from './deckTags';
import { CardDetailDialog } from './dialogs/CardDetailDialog';
import { ExportDeckDialog } from './dialogs/ExportDeckDialog';
import { DeckPlaymatDialog } from './dialogs/DeckPlaymatDialog';
import { PrintingPickerDialog, type PrintingRequest } from './dialogs/PrintingPickerDialog';
import { ShareDeckDialog } from './dialogs/ShareDeckDialog';
import { useDeckEditor } from './hooks/useDeckEditor';
import { useDeckImagePreload } from './hooks/useDeckImagePreload';
import { useDeckLegality } from './hooks/useDeckLegality';
import { useDeckPricing } from './hooks/useDeckPricing';
import { useDeckShareCreate, useDeckSharingSupported } from './hooks/useDeckSharing';
import { useMediaQuery } from './hooks/useMediaQuery';
import type { DeckCard } from './types';

export const WIDE_EDITOR_QUERY = '(min-width: 1340px)';

const DeckEditor = () => {
  const { deckId: deckIdParam, token: draftToken } = useParams<{ deckId: string; token: string }>();
  const parsedDeckId = deckIdParam ? parseInt(deckIdParam, 10) : NaN;
  const deckId = Number.isFinite(parsedDeckId) ? parsedDeckId : null;

  const editor = useDeckEditor(deckId, draftToken ?? null);
  useRecordRecentDeck(deckId, editor.loading ? null : editor.deck);

  const [selected, setSelected] = useState<InspectedCard | null>(null);
  const [printingRequest, setPrintingRequest] = useState<PrintingRequest | null>(null);
  const [detailSnapshot, setDetailSnapshot] = useState<DeckCard | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [playmatOpen, setPlaymatOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const wide = useMediaQuery(WIDE_EDITOR_QUERY);
  const addFieldRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const sharingSupported = useDeckSharingSupported();
  const share = useDeckShareCreate();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareRefusal, setShareRefusal] = useState<string | null>(null);

  const pricing = useDeckPricing(editor.deck, editor.setPriceCache);
  const legality = useDeckLegality(editor.deck);

  const editing = !editor.loading && editor.deck != null;
  useShortcut('deck.undo', () => editor.undo(), { scope: ShortcutScope.DECK_EDITOR, enabled: editing });
  useShortcut('deck.redo', () => editor.redo(), { scope: ShortcutScope.DECK_EDITOR, enabled: editing });
  useShortcut(
    'deck.save',
    () => (editor.saveState === 'failed' ? editor.retrySave() : editor.flushSave()),
    { scope: ShortcutScope.DECK_EDITOR, enabled: editing },
  );
  const openDecksDialog = (open: DecksLocationState['open']) =>
    navigate(RouteEnum.DECKS, { state: { open } satisfies DecksLocationState });
  useShortcut('deck.new', () => openDecksDialog('create'), { scope: ShortcutScope.DECK_EDITOR });
  useShortcut('deck.load', () => openDecksDialog('import'), { scope: ShortcutScope.DECK_EDITOR });

  const isMtg = isMtgFormat(editor.deck?.format);
  const isCommander = isCommanderFormat(editor.deck?.format);

  const tags = useMemo(() => readDeckTags(editor.deck?.tagsXml), [editor.deck?.tagsXml]);

  const groups = useMemo(
    () => groupDeckCards(editor.deck?.cards ?? [], isCommander),
    [editor.deck, isCommander],
  );
  const colorIdentity = useMemo(
    () => dockColorIdentity(editor.deck?.cards ?? [], isCommander),
    [editor.deck, isCommander],
  );

  const preload = useDeckImagePreload(
    deckId ?? (draftToken != null ? `draft:${draftToken}` : null),
    editor.deck,
    editor.loading,
  );

  const startShare = () => {
    if (!isConnected) {
      setShareRefusal(t('DeckSharing.notConnected'));
    } else if (!editor.deck || isBlankDeck(editor.deck)) {
      setShareRefusal(t('DeckSharing.emptyDeck'));
    } else {
      share.reset();
      setShareOpen(true);
    }
  };

  const createShare = (name: string) => {
    if (!editor.deck || !isConnected) {
      return;
    }
    share.create({
      name,
      items: [{ deckList: serializeDeckForSave(editor.deck), colorIdentity: deckColorIdentity(editor.deck.cards) }],
    });
  };

  const selectCard = (card: DeckCard) =>
    setSelected({ name: card.name, category: card.category, scryfallId: card.scryfallId });
  const moveCard = (index: number, category: DeckCard['category']) => {
    const card = editor.deck?.cards[index];
    editor.setCategory(index, category);
    if (card) {
      setSelected({ name: card.name, category, scryfallId: card.scryfallId });
    }
  };
  const addCard = (name: string, zone: 'main' | 'side', scryfallId?: string) => {
    void editor.addCard(name, { zone, scryfallId });
    setSelected({ name, category: zone === 'side' ? 'sideboard' : 'main', scryfallId });
  };

  if (editor.loading) {
    return <DeckEditorSkeleton loaded={0} total={0} />;
  }
  if (editor.notFound || !editor.deck) {
    return <DeckNotFound reason={editor.loadError} />;
  }
  if (!preload.ready) {
    return <DeckEditorSkeleton loaded={preload.loaded} total={preload.total} />;
  }

  const showInspector = wide || inspectorOpen;
  const inspector = (
    <aside
      aria-label={t('DeckEditor.inspector.label')}
      className={[
        'flex min-h-0 w-[316px] flex-col gap-4 overflow-y-auto border-l border-border-subtle bg-bg-surface p-pad',
        wide ? '' : 'absolute inset-y-0 right-0 z-20 shadow-pop',
      ].join(' ')}
    >
      {!wide && (
        <div className="flex items-center">
          <SectionLabel>{t('DeckEditor.inspector.label')}</SectionLabel>
          <IconButton size="sm" label={t('DeckEditor.inspector.close')} className="ml-auto" onClick={() => setInspectorOpen(false)}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      {isMtg && (
        <>
          <DeckInspector
            selected={selected}
            deckCards={editor.deck.cards}
            prices={pricing.prices}
            isCommanderDeck={isCommander}
            onInc={(i, d) => editor.incQuantity(i, d)}
            onDelete={(i) => editor.deleteCard(i)}
            onSetCategory={moveCard}
            onChangePrinting={(i, c) => setPrintingRequest({ index: i, card: c })}
            onShowDetails={setDetailSnapshot}
            onAdd={addCard}
          />
          <section className="flex flex-col gap-3 border-t border-border-subtle pt-4" aria-label={t('DeckEditor.inspector.stats')}>
            <SectionLabel>{t('DeckEditor.inspector.stats')}</SectionLabel>
            <DeckBreakdown
              cards={editor.deck.cards}
              format={editor.deck.format}
              cachedAssessment={editor.deck.bracketAssessment}
              onAssessmentComputed={editor.setBracketAssessment}
            />
          </section>
        </>
      )}
      <SampleHandPanel cards={editor.deck.cards} showImages={isMtg} />
    </aside>
  );

  return (
    <Layout>
      <AuthGuard />
      <div
        className="relative grid h-full min-h-0 bg-bg-base"
        style={{ gridTemplateColumns: showInspector && wide ? '300px minmax(0,1fr) 316px' : '300px minmax(0,1fr)' }}
      >
        <aside
          aria-label={t('DeckEditor.dock.label')}
          className="flex min-h-0 flex-col overflow-hidden border-r border-border-subtle bg-bg-surface"
        >
          {isMtg ? (
            <CardSearchDock
              onAdd={addCard}
              onSelect={(name) => {
                const existing = editor.deck?.cards.find((c) => c.name.toLowerCase() === name.toLowerCase());
                setSelected(existing
                  ? { name: existing.name, category: existing.category, scryfallId: existing.scryfallId }
                  : { name, category: 'main' });
              }}
              colorIdentity={colorIdentity}
              format={editor.deck.format}
              deckCards={editor.deck.cards}
            />
          ) : (
            <div className="p-pad">
              <PlainAddCard onAdd={(name) => addCard(name, 'main')} inputRef={addFieldRef} />
            </div>
          )}
        </aside>

        <main className="relative flex min-h-0 min-w-0 flex-col">
          <DeckEditorHeader
            deck={editor.deck}
            saveState={editor.saveState}
            onRetrySave={editor.retrySave}
            totalMainboardCount={editor.totalMainboardCount}
            totalSideboardCount={editor.totalSideboardCount}
            tags={tags}
            onNameChange={editor.setName}
            onFormatChange={editor.setFormat}
            onTagsChange={editor.setTags}
            onBannerChange={editor.setBanner}
            onEditPlaymat={() => setPlaymatOpen(true)}
            onExport={() => setExportOpen(true)}
            onShare={sharingSupported ? startShare : undefined}
            openDeck={{
              deckId,
              isModified: editor.isModified,
              isBlank: !editor.isModified && isBlankDeck(editor.deck),
              saveNow: editor.saveNow,
              discardChanges: editor.discardChanges,
              pauseAutosave: editor.pauseAutosave,
              resumeAutosave: editor.resumeAutosave,
            }}
            history={(
              <DeckHistoryControls
                history={editor.history}
                canUndo={editor.canUndo}
                canRedo={editor.canRedo}
                onUndo={editor.undo}
                onRedo={editor.redo}
              />
            )}
            legality={(
              <DeckLegalitySummary
                format={editor.deck.format}
                status={legality.status}
                illegalCount={legality.illegalCount}
                unknownCount={legality.unknownCount}
                loading={legality.loading}
              />
            )}
            prices={pricing.prices}
            pricesLoading={pricing.loading}
            isMtg={isMtg}
            trailing={!wide && (
              <IconButton
                label={t('DeckEditor.inspector.toggle')}
                className="border border-border-subtle"
                active={inspectorOpen}
                aria-expanded={inspectorOpen}
                onClick={() => setInspectorOpen((open) => !open)}
              >
                <PanelRight size={15} />
              </IconButton>
            )}
          />
          <DeckMainPane
            deck={editor.deck}
            groups={groups}
            selected={selected}
            onSelect={selectCard}
            onInc={(i, d) => editor.incQuantity(i, d)}
            onDelete={(i) => editor.deleteCard(i)}
            onSetCategory={moveCard}
            onSetCommander={(i, v) => editor.setCommander(i, v)}
            onChangePrinting={(i, c) => setPrintingRequest({ index: i, card: c })}
            onShowDetails={isMtg ? setDetailSnapshot : undefined}
            addFieldRef={addFieldRef}
            isMtg={isMtg}
            isCommander={isCommander}
            legality={legality.rows}
          />
          {showInspector && !wide && inspector}
        </main>

        {showInspector && wide && inspector}
      </div>

      <PrintingPickerDialog
        request={printingRequest}
        deckCards={editor.deck?.cards}
        onClose={() => setPrintingRequest(null)}
        onPick={(printing) => {
          if (!printingRequest) {
            return;
          }
          editor.setPrinting(printingRequest.index, printing);
          setPrintingRequest(null);
        }}
      />

      {isMtg && (
        <CardDetailDialog
          snapshot={detailSnapshot}
          deckCards={editor.deck.cards}
          isCommanderDeck={isCommander}
          prices={pricing.prices}
          onClose={() => setDetailSnapshot(null)}
          onInc={(i) => editor.incQuantity(i, 1)}
          onDec={(i) => editor.incQuantity(i, -1)}
          onSetCategory={moveCard}
          onSetCommander={(i, v) => editor.setCommander(i, v)}
          onChangePrinting={(i, c) => {
            setDetailSnapshot(null);
            setPrintingRequest({ index: i, card: c });
          }}
          onDelete={(i) => {
            editor.deleteCard(i);
            setDetailSnapshot(null);
          }}
          onAdd={(name) => editor.addCard(name)}
        />
      )}

      {playmatOpen && (
        <DeckPlaymatDialog
          playmat={readDeckPlaymat(editor.deck.playmatXml)}
          onClose={() => setPlaymatOpen(false)}
          onSave={(playmat) => {
            editor.setPlaymat(playmat);
            setPlaymatOpen(false);
          }}
        />
      )}

      <ExportDeckDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        deck={editor.deck}
      />

      <ShareDeckDialog
        open={shareOpen}
        defaultName={t('DeckSharing.defaultDeckName')}
        state={share.state}
        onClose={() => {
          share.reset();
          setShareOpen(false);
        }}
        onCreate={createShare}
      />

      <AlertDialog
        isOpen={shareRefusal != null}
        severity="info"
        title={t('DeckSharing.title')}
        message={shareRefusal ?? ''}
        onDismiss={() => setShareRefusal(null)}
      />
    </Layout>
  );
};

export default DeckEditor;
