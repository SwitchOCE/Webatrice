import { useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { readDeckTags } from '../../deckTags';
import { DeckDialogFrame } from '../../dialogs/DeckDialogFrame';
import { useDeckStorageDetails } from '../../hooks/useDeckStorageDetails';
import { DeckBannerPicker } from '../editor/DeckBannerPicker';
import { DeckTagsEditor } from '../editor/DeckTagsEditor';

export function DeckStorageDetails({ deckId, xml, onSaved, colorIdentity }: {
  deckId: number;
  xml: string;
  onSaved: (deckId: number, xml: string) => void;
  colorIdentity?: string;
}) {
  const { t } = useTranslation();
  const details = useDeckStorageDetails(deckId, xml, onSaved, colorIdentity);
  const [tagsOpen, setTagsOpen] = useState(false);
  const titleId = useId();
  const schema = useMemo(() => z.object({ tags: z.array(z.string()) }), []);
  const { control, reset, handleSubmit } = useForm<{ tags: string[] }>({
    defaultValues: { tags: [] }, resolver: zodResolver(schema),
  });
  const deck = details.deck;
  const close = () => {
    if (!details.saving) {
      setTagsOpen(false);
    }
  };
  return (
    <div onPointerEnter={() => void details.activate()} onFocusCapture={() => void details.activate()}
      tabIndex={deck ? undefined : 0} role="group" aria-label={t('DeckStorageDetails.editTags')}>
      <fieldset disabled={details.disabled} className="flex items-end gap-3">
        <DeckBannerPicker cards={deck?.cards ?? []} bannerCard={deck?.bannerCard}
          bannerCardProviderId={deck?.bannerCardProviderId} onChange={(banner) => void details.save({ banner })} />
        <button type="button" className="text-sm" onClick={() => {
          reset({ tags: readDeckTags(deck?.tagsXml) });
          setTagsOpen(true);
        }}>{t('DeckStorageDetails.editTags')}</button>
      </fieldset>
      {details.saving && <p role="status">{t('DeckStorageDetails.saving')}</p>}
      {details.error && !tagsOpen && <p role="alert">{details.error}</p>}
      {tagsOpen && (
        <DeckDialogFrame titleId={titleId} onClose={close}>
          <div className="relative w-full max-w-md rounded-xl border border-border-subtle bg-bg-surface p-5 space-y-4">
            <h2 id={titleId}>{t('DeckStorageDetails.editTags')}</h2>
            <fieldset disabled={details.disabled}>
              <Controller name="tags" control={control} render={({ field }) => (
                <DeckTagsEditor tags={field.value} onChange={field.onChange} />
              )} />
            </fieldset>
            {details.error && <p role="alert">{details.error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={close} disabled={details.saving}>{t('Common.action.cancel')}</button>
              <button type="button" disabled={details.disabled} onClick={handleSubmit(async ({ tags }) => {
                if (await details.save({ tags })) {
                  setTagsOpen(false);
                }
              })}>{t('DeckStorageDetails.ok')}</button>
            </div>
          </div>
        </DeckDialogFrame>
      )}
    </div>
  );
}
