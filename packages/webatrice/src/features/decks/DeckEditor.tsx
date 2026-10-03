import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { server } from '@cockatrice/datatrice';

import { AuthGuard } from '@app/components';
import { AlertDialog } from '@app/dialogs';
import { ShortcutScope, useShortcut } from '@app/feature-widgets/shortcuts';
import { Layout } from '@app/feature-wrappers/layout';
import { useAppSelector } from '@app/store';
import { isCommanderFormat, isMtgFormat } from '@app/types';

import { DeckBannerPicker } from './components/editor/DeckBannerPicker';
import { DeckEditorSkeleton, DeckNotFound } from './components/editor/DeckEditorShells';
import { DeckHistoryControls } from './components/editor/DeckHistoryControls';
import { DeckLegalitySummary } from './components/editor/DeckLegalitySummary';
import { DeckOnlineServices } from './components/editor/DeckOnlineServices';
import { DeckMainPane } from './components/editor/DeckMainPane';
import { DeckSidebar } from './components/editor/DeckSidebar';
import { DeckTagsEditor } from './components/editor/DeckTagsEditor';
import { groupDeckCards } from './deckGrouping';
import { deckColorIdentity, serializeDeckForSave } from './deckPersistence';
import { isBlankDeck } from './deckSharing';
import { readDeckTags } from './deckTags';
import { CardDetailDialog } from './dialogs/CardDetailDialog';
import { ExportDeckDialog } from './dialogs/ExportDeckDialog';
import { PrintingPickerDialog, type PrintingRequest } from './dialogs/PrintingPickerDialog';
import { ShareDeckDialog } from './dialogs/ShareDeckDialog';
import { useDeckEditor } from './hooks/useDeckEditor';
import { useDeckImagePreload } from './hooks/useDeckImagePreload';
import { useDeckLegality } from './hooks/useDeckLegality';
import { useDeckPricing } from './hooks/useDeckPricing';
import { useDeckShareCreate, useDeckSharingSupported } from './hooks/useDeckSharing';
import type { DeckCard } from './types';

/**
 * Deck editor route (`/deck/:deckId`). Layout:
 *   • 360px left sidebar — deck metadata (name, undo/redo and history,
 *     format and its legality, banner card, tags), print and online
 *     services, totals and the hovered card's preview;
 *   • main pane — quick add / advanced search, and the deck as
 *     multi-column type sections (Commander → Creature → … → Land →
 *     Other → Sideboard), illegal rows in red, followed by the sample
 *     hand and the deck breakdown.
 *
 * Deck state and persistence live in `useDeckEditor`; this route owns
 * the transient UI state: the sticky preview card and which dialog is
 * open.
 */
const DeckEditor = () => {
  const { deckId: deckIdParam } = useParams<{ deckId: string }>();
  const parsedDeckId = deckIdParam ? parseInt(deckIdParam, 10) : NaN;
  const deckId = Number.isFinite(parsedDeckId) ? parsedDeckId : null;

  const editor = useDeckEditor(deckId);

  // Sticky preview: the last hovered card stays in the sidebar after the
  // cursor moves on, so a card can be studied without racing to click it.
  const [previewCard, setPreviewCard] = useState<DeckCard | null>(null);
  const [printingRequest, setPrintingRequest] = useState<PrintingRequest | null>(null);
  // Snapshot of the clicked card; the dialog re-resolves it to the live
  // row by (name, category) every render. MTG decks only.
  const [detailSnapshot, setDetailSnapshot] = useState<DeckCard | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const { t } = useTranslation();
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const sharingSupported = useDeckSharingSupported();
  const share = useDeckShareCreate();
  const [shareOpen, setShareOpen] = useState(false);
  // Desktop `AbstractTabDeckEditor::actShareDeck` refuses before opening the dialog.
  const [shareRefusal, setShareRefusal] = useState<string | null>(null);

  const pricing = useDeckPricing(editor.deck, editor.setPriceCache);
  const legality = useDeckLegality(editor.deck);

  const editing = !editor.loading && editor.deck != null;
  useShortcut('deck.undo', () => editor.undo(), { scope: ShortcutScope.DECK_EDITOR, enabled: editing });
  useShortcut('deck.redo', () => editor.redo(), { scope: ShortcutScope.DECK_EDITOR, enabled: editing });

  // `isMtg` gates the whole MTG feature set (Scryfall search, printings,
  // pricing, previews, type grouping); `isCommander` adds the
  // commander-designation affordances on top.
  const isMtg = isMtgFormat(editor.deck?.format);
  const isCommander = isCommanderFormat(editor.deck?.format);

  const tags = useMemo(() => readDeckTags(editor.deck?.tagsXml), [editor.deck?.tagsXml]);

  const groups = useMemo(
    () => groupDeckCards(editor.deck?.cards ?? [], isCommander),
    [editor.deck, isCommander],
  );

  // Hold the skeleton until every card's preview image is in the HTTP
  // cache, so hovering a row feels instant.
  const preload = useDeckImagePreload(deckId, editor.deck, editor.loading);

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

  // Desktop `DlgShareDeck` shares the deck as open in the editor, inline,
  // with the color identity the server can't work out itself.
  const createShare = (name: string) => {
    if (!editor.deck || !isConnected) {
      return;
    }
    share.create({
      name,
      items: [{ deckList: serializeDeckForSave(editor.deck), colorIdentity: deckColorIdentity(editor.deck.cards) }],
    });
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

  return (
    <Layout>
      <AuthGuard />
      <div className="h-full grid bg-bg-base bg-purple-radial" style={{ gridTemplateColumns: '360px 1fr' }}>
        <DeckSidebar
          deck={editor.deck}
          saveState={editor.saveState}
          onRetrySave={editor.retrySave}
          totalMainboardCount={editor.totalMainboardCount}
          totalSideboardCount={editor.totalSideboardCount}
          onNameChange={editor.setName}
          onFormatChange={editor.setFormat}
          onExport={() => setExportOpen(true)}
          onShare={sharingSupported ? startShare : undefined}
          previewCard={previewCard}
          prices={pricing.prices}
          pricesLoading={pricing.loading}
          isMtg={isMtg}
          details={(
            <>
              <DeckLegalitySummary
                format={editor.deck.format}
                status={legality.status}
                illegalCount={legality.illegalCount}
                unknownCount={legality.unknownCount}
                loading={legality.loading}
              />
              <DeckBannerPicker
                cards={editor.deck.cards}
                bannerCard={editor.deck.bannerCard}
                bannerCardProviderId={editor.deck.bannerCardProviderId}
                onChange={editor.setBanner}
              />
              <DeckTagsEditor tags={tags} onChange={editor.setTags} />
              <DeckOnlineServices deck={editor.deck} />
            </>
          )}
          headerActions={(
            <DeckHistoryControls
              history={editor.history}
              canUndo={editor.canUndo}
              canRedo={editor.canRedo}
              onUndo={editor.undo}
              onRedo={editor.redo}
            />
          )}
        />
        <DeckMainPane
          deck={editor.deck}
          groups={groups}
          onAddByName={(name) => void editor.addCard(name)}
          onInc={(i, d) => editor.incQuantity(i, d)}
          onDelete={(i) => editor.deleteCard(i)}
          onSetCategory={(i, c) => editor.setCategory(i, c)}
          onSetCommander={(i, v) => editor.setCommander(i, v)}
          onPreviewCard={setPreviewCard}
          onChangePrinting={(i, c) => setPrintingRequest({ index: i, card: c })}
          onCardClick={isMtg ? setDetailSnapshot : undefined}
          cachedBracketAssessment={editor.deck.bracketAssessment}
          onBracketAssessmentComputed={editor.setBracketAssessment}
          isMtg={isMtg}
          isCommander={isCommander}
          legality={legality.rows}
        />
      </div>

      <PrintingPickerDialog
        request={printingRequest}
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
          onSetCategory={(i, c) => editor.setCategory(i, c)}
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
          // Drop a create still in flight, so a late answer isn't copied after a cancel.
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
