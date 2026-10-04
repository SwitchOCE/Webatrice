import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useNavigate } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';

import { server } from '@cockatrice/datatrice';
import { DialogShell } from '@app/dialogs';
import { usePreference } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { RouteEnum, type DeckRouteState } from '@app/types';
import { flattenFolder, type FlatDeck } from './deckStorage';
import { deckOpenLocation, resolveDeckOpenChoice, type DeckOpenChoice, type DeckOpenLocation } from './deckOpenLocation';

const BUTTON_CLASS = [
  'w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5',
  'rounded-md border border-border-strong bg-bg-elevated',
  'hover:bg-border-subtle text-text-primary text-sm font-medium transition-colors',
].join(' ');

const CHOICE_BUTTON_CLASS = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors';

export interface OpenDeckButtonProps {
  deckId: number;
  isModified: boolean;
  isBlank: boolean;
  saveNow: () => Promise<boolean>;
  discardChanges: () => void;
}

/**
 * The editor's own "load deck": desktop's `AbstractTabDeckEditor::actLoadDeck`, with the deck
 * storage standing in for the file dialog. Where the deck opens follows `confirmOpen` (see
 * `deckOpenLocation`), including its Save / Discard / "Open in new tab" prompt for a modified
 * deck when "Open deck in new tab by default" is off.
 */
function OpenDeckButton({ deckId, isModified, isBlank, saveNow, discardChanges }: OpenDeckButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openDeckInNewTab = usePreference('openDeckInNewTab');
  const backendDecks = useAppSelector(server.Selectors.getBackendDecks);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<FlatDeck | null>(null);

  const decks = useMemo(
    () => (backendDecks?.root ? flattenFolder(backendDecks.root, '') : [])
      .filter((deck) => deck.id !== deckId)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [backendDecks, deckId],
  );

  const open = (deck: FlatDeck, location: DeckOpenLocation) => {
    if (location === 'cancelled') {
      return;
    }
    const route = generatePath(RouteEnum.DECK, { deckId: String(deck.id) });
    navigate(route, location === 'same-tab' ? { state: { replacesDeckId: deckId } satisfies DeckRouteState } : undefined);
  };

  const pick = (deck: FlatDeck) => {
    setPickerOpen(false);
    const location = deckOpenLocation({ openDeckInNewTab, isModified, isBlank });
    if (location === 'prompt') {
      setPending(deck);
    } else {
      open(deck, location);
    }
  };

  const choose = async (choice: DeckOpenChoice) => {
    const deck = pending;
    setPending(null);
    if (!deck) {
      return;
    }
    if (choice === 'discard') {
      discardChanges();
    }
    open(deck, await resolveDeckOpenChoice(choice, saveNow));
  };

  return (
    <>
      <button type="button" onClick={() => setPickerOpen(true)} className={BUTTON_CLASS}>
        <FolderOpen size={13} /> {t('OpenDeckButton.label')}
      </button>

      <DialogShell isOpen={pickerOpen} handleClose={() => setPickerOpen(false)} title={t('OpenDeckButton.pickerTitle')}>
        {decks.length === 0 ? (
          <p>{t('OpenDeckButton.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {decks.map((deck) => (
              <li key={deck.id}>
                <button
                  type="button"
                  onClick={() => pick(deck)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-bg-elevated text-text-primary"
                >
                  {deck.path ? `${deck.path}/${deck.name}` : deck.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogShell>

      <DialogShell isOpen={pending !== null} handleClose={() => void choose('cancel')} title={t('OpenDeckButton.confirmTitle')}>
        <p className="whitespace-pre-line">{t('OpenDeckButton.confirmMessage')}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => void choose('cancel')} className={`${CHOICE_BUTTON_CLASS} hover:bg-bg-elevated`}>
            {t('OpenDeckButton.cancel')}
          </button>
          <button type="button" onClick={() => void choose('new-tab')} className={`${CHOICE_BUTTON_CLASS} hover:bg-bg-elevated`}>
            {t('OpenDeckButton.openInNewTab')}
          </button>
          <button type="button" onClick={() => void choose('discard')} className={`${CHOICE_BUTTON_CLASS} hover:bg-bg-elevated`}>
            {t('OpenDeckButton.discard')}
          </button>
          <button
            type="button"
            onClick={() => void choose('save')}
            className={`${CHOICE_BUTTON_CLASS} bg-accent text-white hover:bg-accent-hover`}
          >
            {t('OpenDeckButton.save')}
          </button>
        </div>
      </DialogShell>
    </>
  );
}

export default OpenDeckButton;
