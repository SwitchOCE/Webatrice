import { useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleAlert, Loader2 } from 'lucide-react';

import { Button, TextInput } from '@app/components';

import { DeckBannerPicker } from '../components/editor/DeckBannerPicker';
import { DeckTagsEditor } from '../components/editor/DeckTagsEditor';
import type { DeckStorageEditKind } from '../components/list/DeckActionsMenu';
import { readDeckTags, type BannerCandidate } from '../deckTags';
import type { FlatDeck } from '../deckTree';
import { useDeckStorageDetails, type DeckStorageEdit } from '../hooks/useDeckStorageDetails';
import { DeckDialogFrame } from './DeckDialogFrame';

export interface DeckStorageEditDialogProps {
  kind: DeckStorageEditKind;
  deck: FlatDeck;
  xml: string;
  onSaved: (deckId: number, xml: string) => void;
  onClose: () => void;
}

const TITLE_KEYS = {
  rename: 'DeckStorageEditDialog.title.rename',
  tags: 'DeckStorageEditDialog.title.tags',
  banner: 'DeckStorageEditDialog.title.banner',
} as const satisfies Record<DeckStorageEditKind, string>;

type Draft = { name: string } | { tags: string[] } | { banner: BannerCandidate | null };

export function DeckStorageEditDialog({ kind, deck, xml, onSaved, onClose }: DeckStorageEditDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const details = useDeckStorageDetails(deck.id, xml, onSaved, deck.colorIdentity);
  const [draft, setDraft] = useState<Draft | null>(null);
  const loaded = details.deck;

  const { activate } = details;
  useEffect(() => {
    void activate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per opened dialog
  }, []);

  useEffect(() => {
    if (!loaded || draft) {
      return;
    }
    if (kind === 'rename') {
      setDraft({ name: loaded.name || deck.name });
    } else if (kind === 'tags') {
      setDraft({ tags: readDeckTags(loaded.tagsXml) });
    } else {
      setDraft({ banner: loaded.bannerCard ? { name: loaded.bannerCard, providerId: loaded.bannerCardProviderId } : null });
    }
  }, [loaded, draft, kind, deck.name]);

  const close = () => {
    if (!details.saving) {
      onClose();
    }
  };
  const invalid = draft != null && 'name' in draft && !draft.name.trim();
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft || invalid || details.disabled) {
      return;
    }
    const edit: DeckStorageEdit = 'name' in draft ? { name: draft.name.trim() } : draft;
    if (await details.save(edit)) {
      onClose();
    }
  };

  return (
    <DeckDialogFrame titleId={titleId} onClose={close}>
      <div
        className="relative flex w-full max-w-md flex-col gap-4 rounded-ui-lg border border-border-subtle bg-bg-surface p-5 shadow-pop"
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="font-display text-[18px] font-semibold text-text-primary">
            {t(TITLE_KEYS[kind])}
          </h2>
          <p className="truncate text-[12px] text-text-muted">{deck.name}</p>
        </div>
        {details.editorHasChanges && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-ui border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] text-warning"
          >
            <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
            {t('DeckStorageEditDialog.editorHasChanges')}
          </p>
        )}
        {!draft && !details.error && (
          <p role="status" className="flex items-center gap-2 text-[13px] text-text-muted">
            <Loader2 size={14} className="animate-spin text-accent" aria-hidden />
            {t('DeckStorageEditDialog.loading')}
          </p>
        )}
        {draft && (
          <fieldset disabled={details.disabled} className="flex flex-col gap-3">
            {'name' in draft && (
              <form onSubmit={submit}>
                <TextInput
                  icon={null}
                  label={t('DeckStorageEditDialog.name')}
                  value={draft.name}
                  onChange={(e) => setDraft({ name: e.target.value })}
                  aria-invalid={invalid || undefined}
                  autoFocus
                  maxLength={255}
                />
              </form>
            )}
            {'tags' in draft && <DeckTagsEditor tags={draft.tags} onChange={(tags) => setDraft({ tags })} />}
            {'banner' in draft && (
              <DeckBannerPicker
                cards={loaded?.cards ?? []}
                bannerCard={draft.banner?.name}
                bannerCardProviderId={draft.banner?.providerId}
                onChange={(banner) => setDraft({ banner })}
              />
            )}
          </fieldset>
        )}
        {details.saving && <p role="status" className="text-[12px] text-text-muted">{t('DeckStorageEditDialog.saving')}</p>}
        {details.error && <p role="alert" className="text-[13px] text-danger">{details.error}</p>}
        <p className="text-[12px] text-text-muted">{t('DeckStorageEditDialog.howItWorks')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={close} disabled={details.saving}>{t('Common.action.cancel')}</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!draft || invalid || details.disabled}>
            {t('DeckStorageEditDialog.save')}
          </Button>
        </div>
      </div>
    </DeckDialogFrame>
  );
}
